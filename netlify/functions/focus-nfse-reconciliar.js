// Netlify Function — reconcilia emissões Focus NFe com status 'processando'
//
// Busca todas as nfse_emissoes com chave_acesso iniciando em 'FOCUS:' e
// status = 'processando', consulta o Focus NFe para cada uma e atualiza
// o banco caso a nota já tenha sido autorizada, cancelada ou retornado erro.
//
// Uso: POST (sem body obrigatório) — protegido por SUPABASE_SERVICE_KEY no header
// Exemplo:
//   curl -X POST https://app.imobinota.com.br/.netlify/functions/focus-nfse-reconciliar \
//        -H "x-service-key: SEU_SERVICE_KEY"
//
// Retorna: { ok, total, updated, skipped, errors, results[] }

const FOCUS_URL_PROD = 'https://api.focusnfe.com.br/v2'
const FOCUS_URL_HOMO = 'https://homologacao.focusnfe.com.br/v2'

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }

  // Valida JWT do usuário para identificar quem está chamando
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Token de autenticação ausente' }) }
  }

  // Busca o userId via Supabase auth
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${jwt}` },
  })
  if (!userRes.ok) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Token inválido ou expirado' }) }
  }
  const userData = await userRes.json()
  const callerId = userData?.id
  if (!callerId) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Usuário não identificado' }) }
  }

  // Lê userId alvo do body (pode ser diferente se for pai reconciliando filho)
  let targetUserId = callerId
  try {
    const body = JSON.parse(event.body || '{}')
    if (body.userId) targetUserId = body.userId
  } catch {}

  try {
    return await handle(SUPABASE_URL, SERVICE_KEY, targetUserId)
  } catch (err) {
    console.error('[focus-nfse-reconciliar] EXCEÇÃO:', err?.message, err?.stack)
    return { statusCode: 500, body: JSON.stringify({ error: err?.message }) }
  }
}

async function handle(SUPABASE_URL, SERVICE_KEY, userId) {
  // ── 1. Busca emissões "processando" do Focus para este usuário ─
  const emRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `nfse_emissoes?status=eq.processando&chave_acesso=like.FOCUS:*&user_id=eq.${userId}&select=id,user_id,chave_acesso,status&order=created_at.asc&limit=100`
  )
  const emRows = await emRes.json()

  if (!Array.isArray(emRows) || emRows.length === 0) {
    console.log('[focus-nfse-reconciliar] Nenhuma emissão processando encontrada')
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, total: 0, updated: 0, skipped: 0, errors: 0, results: [] }),
    }
  }

  console.log('[focus-nfse-reconciliar] Emissões processando encontradas:', emRows.length)

  // ── 2. Carrega perfis únicos (evita consultas repetidas) ───────
  const userIds = [...new Set(emRows.map(e => e.user_id))]
  const profRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=in.(${userIds.join(',')})&select=id,focus_token,focus_token_prod,focus_homologacao,focus_nfse_legado`
  )
  const profiles = await profRes.json()
  const profileMap = {}
  for (const p of (profiles || [])) profileMap[p.id] = p

  // ── 3. Processa cada emissão ───────────────────────────────────
  const results = []
  let updated = 0, skipped = 0, errors = 0

  for (const em of emRows) {
    const ref = (em.chave_acesso || '').replace(/^FOCUS:/, '')
    if (!ref) { skipped++; continue }

    const p = profileMap[em.user_id]
    if (!p) {
      console.warn('[focus-nfse-reconciliar] Perfil não encontrado userId:', em.user_id)
      errors++
      results.push({ id: em.id, ref, resultado: 'erro', detalhe: 'perfil não encontrado' })
      continue
    }

    const homologacao   = !!p.focus_homologacao
    const nfseIsLegado  = !!p.focus_nfse_legado
    const FOCUS_BASE    = homologacao ? FOCUS_URL_HOMO : FOCUS_URL_PROD
    const focusToken    = homologacao ? p.focus_token : (p.focus_token_prod || p.focus_token)
    const nfseEndpoint  = nfseIsLegado ? 'nfse' : 'nfsen'

    if (!focusToken) {
      console.warn('[focus-nfse-reconciliar] Token Focus ausente userId:', em.user_id)
      skipped++
      results.push({ id: em.id, ref, resultado: 'skip', detalhe: 'token ausente' })
      continue
    }

    // ── Consulta Focus NFe ───────────────────────────────────────
    let detData, detRes
    try {
      detRes  = await focusFetch(`${FOCUS_BASE}/${nfseEndpoint}/${encodeURIComponent(ref)}?completo=1`, 'GET', null, focusToken)
      detData = await detRes.json()
    } catch (e) {
      console.error('[focus-nfse-reconciliar] Erro ao consultar Focus ref:', ref, e.message)
      errors++
      results.push({ id: em.id, ref, resultado: 'erro', detalhe: e.message })
      continue
    }

    console.log('[focus-nfse-reconciliar] ref:', ref, '| Focus status:', detData.status, '| HTTP:', detRes.status)

    // Se Focus retornou 404 ou status desconhecido, pula
    if (!detRes.ok || !detData.status) {
      skipped++
      results.push({ id: em.id, ref, resultado: 'skip', detalhe: `Focus HTTP ${detRes.status}` })
      continue
    }

    const focusStatus = detData.status

    // Mapa Focus → interno
    const statusMap = {
      autorizado:       'emitida',
      erro:             'erro',
      erro_autorizacao: 'erro',
      cancelado:        'cancelada',
    }
    const dbStatus = statusMap[focusStatus]

    // Se ainda está processando no Focus, não atualiza
    if (!dbStatus) {
      skipped++
      results.push({ id: em.id, ref, resultado: 'skip', detalhe: `Focus ainda processando (${focusStatus})` })
      continue
    }

    // ── Busca XML se autorizado ──────────────────────────────────
    let xmlNfse = null
    if (focusStatus === 'autorizado') {
      const xmlCaminho = detData.caminho_xml_nota_fiscal || detData.url_xml || null
      if (xmlCaminho) {
        const focusBaseDomain = FOCUS_BASE.replace('/v2', '')
        const xmlFullUrl = xmlCaminho.startsWith('http') ? xmlCaminho : `${focusBaseDomain}${xmlCaminho}`
        try {
          const xmlRes = await focusFetch(xmlFullUrl, 'GET', null, focusToken)
          if (xmlRes.ok) {
            xmlNfse = await xmlRes.text()
            console.log('[focus-nfse-reconciliar] XML obtido, tamanho:', xmlNfse.length)
          }
        } catch (e) {
          console.warn('[focus-nfse-reconciliar] Erro ao buscar XML:', e.message)
        }
      }
    }

    const numeroNfse = detData.numero || detData.numero_nfse || null
    const errMsg = (focusStatus === 'erro' || focusStatus === 'erro_autorizacao')
      ? (detData?.erros?.[0]?.mensagem || detData?.mensagem_sefaz || `Focus: ${focusStatus}`)
      : null

    // ── Atualiza banco ───────────────────────────────────────────
    const patch = {
      status: dbStatus,
      ...(numeroNfse ? { numero_nfse: numeroNfse } : {}),
      ...(xmlNfse    ? { xml_nfse:    xmlNfse }    : {}),
      ...(errMsg     ? { erro_msg:    errMsg }     : {}),
      ...(focusStatus === 'cancelado' ? { cancelado_em: new Date().toISOString() } : {}),
    }

    const updRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
      `nfse_emissoes?id=eq.${em.id}`, 'PATCH', patch
    )
    console.log('[focus-nfse-reconciliar] PATCH id:', em.id, '| HTTP:', updRes.status, '| novo status:', dbStatus, '| numero:', numeroNfse)

    updated++
    results.push({ id: em.id, ref, resultado: 'atualizado', novoStatus: dbStatus, numeroNfse })
  }

  const summary = { ok: true, total: emRows.length, updated, skipped, errors, results }
  console.log('[focus-nfse-reconciliar] RESUMO:', JSON.stringify({ total: emRows.length, updated, skipped, errors }))

  return { statusCode: 200, body: JSON.stringify(summary) }
}

// ── Helpers ────────────────────────────────────────────────────────

async function focusFetch(url, method, body, token) {
  const basicAuth = Buffer.from(`${token}:`).toString('base64')
  const opts = {
    method,
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type':  'application/json',
    },
  }
  if (body) opts.body = JSON.stringify(body)
  return fetch(url, opts)
}

function supabaseFetch(url, key, path, method = 'GET', body) {
  const prefer = method === 'PATCH' ? 'return=minimal' : undefined
  const opts = {
    method,
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      ...(prefer ? { 'Prefer': prefer } : {}),
    },
  }
  if (body) opts.body = JSON.stringify(body)
  return fetch(`${url}/rest/v1/${path}`, opts)
}
