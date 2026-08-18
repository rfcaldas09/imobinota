// admin-stats.js — estatísticas de usuários + toggle ativo/inativo
// Protegido: só o email admin pode chamar (verificado via JWT do Supabase)

const ADMIN_EMAIL = 'rafael.fcaldas@gmail.com'

const { createClient } = require('@supabase/supabase-js')

// ── Helper: verifica autenticação e retorna supabase client ────────
async function authenticate(event, headers) {
  const token = (event.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return { error: { statusCode: 401, body: 'Não autorizado' } }

  const SUPABASE_URL     = process.env.SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { error: { statusCode: 500, body: `Configuração incompleta (URL=${!!SUPABASE_URL} KEY=${!!SERVICE_ROLE_KEY})` } }
  }

  let jwtEmail = null
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    jwtEmail = payload.email || null
  } catch (_) {
    return { error: { statusCode: 401, body: 'Token malformado' } }
  }

  if (!jwtEmail || jwtEmail.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return { error: { statusCode: 403, body: 'Acesso negado' } }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return { supabase }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }

  const { supabase, error: authError } = await authenticate(event, headers)
  if (authError) {
    return { statusCode: authError.statusCode, headers, body: JSON.stringify({ error: authError.body }) }
  }

  // ── PATCH: toggle admin_ativo de um usuário ──────────────────
  if (event.httpMethod === 'PATCH') {
    let body
    try { body = JSON.parse(event.body || '{}') } catch (_) { body = {} }
    const { userId, admin_ativo } = body
    if (!userId || typeof admin_ativo !== 'boolean') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'userId e admin_ativo são obrigatórios' }) }
    }
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ admin_ativo })
      .eq('id', userId)
    if (updErr) return { statusCode: 500, headers, body: JSON.stringify({ error: updErr.message }) }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  }

  // ── GET: lista de usuários com estatísticas ──────────────────
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers }

  // Busca todos os perfis
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, company_name, cnpj, email_contato, nfse_cert_path, plano_tipo, plano_fim, created_at, admin_ativo')
    .order('created_at', { ascending: false })

  if (profErr) return { statusCode: 500, headers, body: JSON.stringify({ error: profErr.message }) }

  // Busca emails reais do auth
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const emailByUid = {}
  if (authUsers?.users) {
    for (const u of authUsers.users) emailByUid[u.id] = u.email
  }

  // Busca todas as emissões
  const { data: emissoes, error: emErr } = await supabase
    .from('nfse_emissoes')
    .select('id, user_id, cobranca_id, status, valor_servico, erro_msg, created_at')

  if (emErr) return { statusCode: 500, headers, body: JSON.stringify({ error: emErr.message }) }

  // Agrega por usuário
  const statsById = {}
  for (const em of emissoes || []) {
    if (!statsById[em.user_id]) {
      statsById[em.user_id] = {
        avulsa_ok: 0, avulsa_erro: 0, avulsa_erros: [],
        rec_ok: 0, rec_erro: 0, total_emitido: 0,
      }
    }
    const s    = statsById[em.user_id]
    const isAv = em.cobranca_id === null

    if (em.status === 'emitida') {
      if (isAv) s.avulsa_ok++; else s.rec_ok++
      s.total_emitido += parseFloat(em.valor_servico || 0)
    } else if (em.status === 'erro') {
      if (isAv) { s.avulsa_erro++; s.avulsa_erros.push({ data: em.created_at, msg: em.erro_msg || '(sem mensagem)' }) }
      else s.rec_erro++
    }
  }

  const usuarios = (profiles || []).map(p => ({
    id:          p.id,
    email:       emailByUid[p.id] || p.email_contato || '—',
    company:     p.company_name || '—',
    cnpj:        p.cnpj        || '—',
    cert_ok:     !!p.nfse_cert_path,
    plano:       p.plano_tipo  || null,
    plano_fim:   p.plano_fim   || null,
    created_at:  p.created_at,
    admin_ativo: p.admin_ativo !== false, // default true
    ...(statsById[p.id] || {
      avulsa_ok: 0, avulsa_erro: 0, avulsa_erros: [],
      rec_ok: 0, rec_erro: 0, total_emitido: 0,
    }),
  }))

  return {
    statusCode: 200,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuarios }),
  }
}
