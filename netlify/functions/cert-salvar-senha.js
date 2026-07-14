// Netlify Function — salva/atualiza senha do certificado .pfx
// O frontend NÃO criptografa: envia a senha em plain-text via HTTPS.
// Esta função criptografa com NFSE_CERT_KEY (server-only) e grava no Supabase.

const crypto = require('crypto')

const SUPABASE_URL  = process.env.SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY
const CERT_KEY      = process.env.NFSE_CERT_KEY  // 32-char hex → 128-bit AES key

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  // ── Verificar JWT do usuário via Supabase ────────────────────
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token não informado' }) }

  // Busca o userId via /auth/v1/user com o JWT do cliente
  const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': SERVICE_KEY },
  })
  if (!meRes.ok) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido' }) }
  const { id: userId } = await meRes.json()
  if (!userId) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) }

  // ── Parse do body ───────────────────────────────────────────
  let body
  try { body = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) } }

  const { password, certPath } = body
  if (!password) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Senha não informada' }) }

  // ── Criptografar a senha com NFSE_CERT_KEY ──────────────────
  let encPassword = ''
  if (CERT_KEY) {
    const key = Buffer.from(CERT_KEY, 'hex')
    const iv  = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv)
    const enc = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
    encPassword = iv.toString('hex') + enc.toString('hex')
  } else {
    // Sem chave: avisa mas não salva em plain text — bloqueia
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'NFSE_CERT_KEY não configurada no servidor. Configure em Netlify → Environment Variables.' }),
    }
  }

  // ── Salvar no Supabase ──────────────────────────────────────
  const payload = { nfse_cert_password_enc: encPassword }
  if (certPath) payload.nfse_cert_path = certPath

  const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(payload),
  })

  if (!dbRes.ok) {
    const err = await dbRes.text()
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro ao salvar no banco: ' + err }) }
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
}
