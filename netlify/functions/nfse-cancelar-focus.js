// Netlify Function — cancela NFS-e emitida via Focus NFe
// POST { userId, emissaoId }
//
// Fluxo:
//   1. Busca emissão no Supabase (valida dono, status e chave_acesso no formato FOCUS:{ref})
//   2. Extrai o {ref} da chave_acesso
//   3. Busca focus_token do perfil
//   4. DELETE /v2/nfse/{ref} na API Focus NFe com justificativa
//   5. Atualiza status = 'cancelada' no Supabase
//
// Docs: https://focusnfe.com.br/doc/#nfse-cancelamento-de-nfs-e

const FOCUS_URL_PROD = 'https://api.focusnfe.com.br/v2'
const FOCUS_URL_HOMO = 'https://homologacao.focusnfe.com.br/v2'

const JUSTIFICATIVA = 'Nota fiscal emitida com dados incorretos. Solicitado cancelamento pelo prestador de servicos.'

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { userId, emissaoId } = body
  if (!userId || !emissaoId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId e emissaoId são obrigatórios' }) }
  }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }

  // ── 1. Busca emissão ──────────────────────────────────────────
  const emRes  = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `nfse_emissoes?id=eq.${emissaoId}&user_id=eq.${userId}&select=*`, 'GET')
  const emRows = await emRes.json()
  const em     = emRows?.[0]

  if (!em) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Emissão não encontrada' }) }
  }
  if (em.status !== 'emitida') {
    return { statusCode: 400, body: JSON.stringify({ error: `Não é possível cancelar nota com status "${em.status}"` }) }
  }
  if (!em.chave_acesso?.startsWith('FOCUS:')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Esta nota não foi emitida via Focus NFe' }) }
  }

  const focusRef = em.chave_acesso.replace('FOCUS:', '')
  console.log('[nfse-cancelar-focus] focusRef:', focusRef, '| emissaoId:', emissaoId)

  // ── 2. Busca perfil (token + homologação) ─────────────────────
  const profRes  = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}&select=focus_token,focus_homologacao`, 'GET')
  const profRows = await profRes.json()
  const p        = profRows?.[0]

  if (!p?.focus_token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Token Focus NFe não configurado no perfil' }) }
  }

  const homologacao = !!p.focus_homologacao
  const FOCUS_BASE  = homologacao ? FOCUS_URL_HOMO : FOCUS_URL_PROD

  // ── 3. DELETE /v2/nfse/{ref} ──────────────────────────────────
  const cancelUrl = `${FOCUS_BASE}/nfse/${encodeURIComponent(focusRef)}`
  console.log('[nfse-cancelar-focus] cancelando:', cancelUrl)

  let focusStatus, focusBody
  try {
    const res    = await focusFetch(cancelUrl, 'DELETE', { justificativa: JUSTIFICATIVA }, p.focus_token)
    focusStatus  = res.status
    const text   = await res.text()
    try { focusBody = JSON.parse(text) } catch { focusBody = { raw: text } }
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: `Erro na comunicação com Focus NFe: ${err.message}` }) }
  }

  console.log('[nfse-cancelar-focus] Focus status:', focusStatus, '| body:', JSON.stringify(focusBody))

  // Focus retorna 200 (cancelada imediatamente) ou 202 (cancelamento em processamento)
  // 422 = nota não pode ser cancelada (prazo expirado, status inválido, etc.)
  if (focusStatus !== 200 && focusStatus !== 202) {
    const errMsg = focusBody?.erros?.[0]?.mensagem
      || focusBody?.message
      || `Focus NFe HTTP ${focusStatus}`
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Erro ao cancelar no Focus NFe: ${errMsg}`, focusRaw: focusBody }),
    }
  }

  // ── 4. Atualiza status no Supabase ────────────────────────────
  await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `nfse_emissoes?id=eq.${emissaoId}`, 'PATCH', {
      status:              'cancelada',
      cancelado_em:        new Date().toISOString(),
      motivo_cancelamento: '1', // 1 = Erro na emissão (padrão)
    })

  console.log('[nfse-cancelar-focus] cancelamento concluído:', { emissaoId, focusRef })

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, emissaoId, canceladoEm: new Date().toISOString() }),
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
  const opts = {
    method,
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      'Prefer':        method === 'PATCH' ? 'return=minimal' : undefined,
    },
  }
  if (body) opts.body = JSON.stringify(body)
  return fetch(`${url}/rest/v1/${path}`, opts)
}
