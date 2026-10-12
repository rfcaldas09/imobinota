// Netlify Function — recebe webhooks (hooks) do Focus NFe
// Focus chama este endpoint quando o status de uma NFS-e muda
//
// Payload do Focus:
//   { cnpj_emitente, ref, status, url }
//
// Fluxo:
//   1. Valida e extrai ref do payload
//   2. Busca emissão em nfse_emissoes pela chave_acesso = 'FOCUS:{ref}'
//   3. Busca perfil do usuário para obter o token Focus
//   4. Faz GET no Focus para obter os dados completos da nota
//   5. Atualiza nfse_emissoes com status, numero_nfse, xml_nfse
//
// Docs Focus: https://focusnfe.com.br/doc/#introducao-hooks

const FOCUS_URL_PROD = 'https://api.focusnfe.com.br/v2'
const FOCUS_URL_HOMO = 'https://homologacao.focusnfe.com.br/v2'

exports.handler = async (event) => {
  // Focus envia POST; responder 200 rapidamente para evitar retentativas
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    return await handle(event)
  } catch (err) {
    console.error('[focus-nfse-webhook] EXCEÇÃO:', err?.message, err?.stack)
    // Retorna 200 mesmo em erro — Focus não deve retentar por falha interna nossa
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: err?.message }) }
  }
}

async function handle(event) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[focus-nfse-webhook] Supabase não configurado')
    return { statusCode: 200, body: JSON.stringify({ ok: false }) }
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    console.error('[focus-nfse-webhook] Body inválido:', event.body?.slice(0, 200))
    return { statusCode: 200, body: JSON.stringify({ ok: false }) }
  }

  const { ref, cnpj_emitente, status: focusStatus } = payload
  console.log('[focus-nfse-webhook] recebido | ref:', ref, '| cnpj:', cnpj_emitente, '| status:', focusStatus)

  if (!ref) {
    console.warn('[focus-nfse-webhook] Payload sem ref — ignorado')
    return { statusCode: 200, body: JSON.stringify({ ok: true, msg: 'sem ref' }) }
  }

  // ── 1. Busca emissão pela chave_acesso ─────────────────────────
  const emRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `nfse_emissoes?chave_acesso=eq.FOCUS:${encodeURIComponent(ref)}&select=id,user_id,status`
  )
  const emRows = await emRes.json()
  const em = emRows?.[0]

  if (!em) {
    console.warn('[focus-nfse-webhook] Emissão não encontrada para ref:', ref)
    return { statusCode: 200, body: JSON.stringify({ ok: true, msg: 'emissao nao encontrada' }) }
  }

  // Não reprocessar notas que já foram finalizadas
  if (em.status === 'emitida' || em.status === 'cancelada') {
    console.log('[focus-nfse-webhook] Emissão já finalizada, status:', em.status, '— ignorado')
    return { statusCode: 200, body: JSON.stringify({ ok: true, msg: 'ja finalizada' }) }
  }

  // ── 2. Busca perfil para obter token Focus ─────────────────────
  const profRes  = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${em.user_id}&select=focus_token,focus_token_prod,focus_homologacao`
  )
  const profRows = await profRes.json()
  const p        = profRows?.[0]

  if (!p) {
    console.error('[focus-nfse-webhook] Perfil não encontrado userId:', em.user_id)
    return { statusCode: 200, body: JSON.stringify({ ok: false }) }
  }

  const homologacao = !!p.focus_homologacao
  const FOCUS_BASE  = homologacao ? FOCUS_URL_HOMO : FOCUS_URL_PROD
  const focusToken  = homologacao ? p.focus_token : (p.focus_token_prod || p.focus_token)

  // ── 3. Busca dados completos da nota no Focus ──────────────────
  const detRes  = await focusFetch(`${FOCUS_BASE}/nfsen/${encodeURIComponent(ref)}?completo=1`, 'GET', null, focusToken)
  const detData = await detRes.json()
  console.log('[focus-nfse-webhook] Focus GET status:', detRes.status, '| nfse status:', detData.status)

  if (!detRes.ok) {
    console.error('[focus-nfse-webhook] Erro ao buscar dados Focus:', JSON.stringify(detData))
    return { statusCode: 200, body: JSON.stringify({ ok: false }) }
  }

  const newStatus   = detData.status
  const numeroNfse  = detData.numero || detData.numero_nfse || null

  // ── 4. Tenta baixar XML (caminho relativo → URL completa) ──────
  let xmlNfse = null
  const xmlCaminho = detData.caminho_xml_nota_fiscal || detData.url_xml || null
  if (xmlCaminho && (newStatus === 'autorizado')) {
    const focusBaseDomain = FOCUS_BASE.replace('/v2', '')
    const xmlFullUrl = xmlCaminho.startsWith('http') ? xmlCaminho : `${focusBaseDomain}${xmlCaminho}`
    try {
      const xmlRes = await focusFetch(xmlFullUrl, 'GET', null, focusToken)
      if (xmlRes.ok) {
        xmlNfse = await xmlRes.text()
        console.log('[focus-nfse-webhook] XML obtido, tamanho:', xmlNfse.length)
      }
    } catch (e) {
      console.warn('[focus-nfse-webhook] Erro ao buscar XML:', e.message)
    }
  }

  // ── 5. Mapeia status Focus → status interno ───────────────────
  const statusMap = {
    autorizado:         'emitida',
    erro:               'erro',
    erro_autorizacao:   'erro',
    cancelado:          'cancelada',
  }
  const dbStatus = statusMap[newStatus] || 'processando'

  // Extrai mensagem de erro se houver
  const errMsg = (newStatus === 'erro' || newStatus === 'erro_autorizacao')
    ? (detData?.erros?.[0]?.mensagem || detData?.mensagem_sefaz || `Focus status: ${newStatus}`)
    : null

  // ── 6. Atualiza nfse_emissoes ──────────────────────────────────
  const patch = {
    status:      dbStatus,
    ...(numeroNfse ? { numero_nfse: numeroNfse }   : {}),
    ...(xmlNfse    ? { xml_nfse:    xmlNfse }       : {}),
    ...(errMsg     ? { erro_msg:    errMsg }        : {}),
    ...(newStatus === 'cancelado' ? { cancelado_em: new Date().toISOString() } : {}),
  }

  const updRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `nfse_emissoes?id=eq.${em.id}`, 'PATCH', patch
  )
  console.log('[focus-nfse-webhook] UPDATE status HTTP:', updRes.status, '| novo status:', dbStatus, '| nfseNum:', numeroNfse)

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, emissaoId: em.id, status: dbStatus }),
  }
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
