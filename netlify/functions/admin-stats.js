// admin-stats.js — retorna estatísticas de todos os usuários para o painel admin
// Protegido: só o email admin pode chamar (verificado via JWT do Supabase)

const ADMIN_EMAIL = 'rafael.fcaldas@gmail.com'

const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'GET')    return { statusCode: 405, headers }

  // ── Verifica autenticação ────────────────────────────────────
  const token = (event.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) }

  const SUPABASE_URL     = process.env.SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Configuração do servidor incompleta (URL=${!!SUPABASE_URL} KEY=${!!SERVICE_ROLE_KEY})` }) }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Valida JWT e verifica se é admin
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido' }) }
  if (user.email !== ADMIN_EMAIL) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) }

  // ── Busca todos os perfis ────────────────────────────────────
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, company_name, cnpj, email_contato, nfse_cert_path, plano_tipo, plano_fim, created_at, stripe_customer_id')
    .order('created_at', { ascending: false })

  if (profErr) return { statusCode: 500, headers, body: JSON.stringify({ error: profErr.message }) }

  // ── Busca emails da tabela auth (service role tem acesso) ────
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const emailByUid = {}
  if (authUsers?.users) {
    for (const u of authUsers.users) emailByUid[u.id] = u.email
  }

  // ── Busca todas as emissões ──────────────────────────────────
  const { data: emissoes, error: emErr } = await supabase
    .from('nfse_emissoes')
    .select('id, user_id, cobranca_id, status, valor_servico, erro_msg, created_at')

  if (emErr) return { statusCode: 500, headers, body: JSON.stringify({ error: emErr.message }) }

  // ── Agrega por usuário ───────────────────────────────────────
  const statsById = {}
  for (const em of emissoes || []) {
    if (!statsById[em.user_id]) {
      statsById[em.user_id] = {
        avulsa_ok:    0,
        avulsa_erro:  0,
        avulsa_erros: [], // lista detalhada de erros
        rec_ok:       0,
        rec_erro:     0,
        total_emitido: 0,
      }
    }
    const s    = statsById[em.user_id]
    const isAv = em.cobranca_id === null

    if (em.status === 'emitida') {
      if (isAv) s.avulsa_ok++; else s.rec_ok++
      s.total_emitido += parseFloat(em.valor_servico || 0)
    } else if (em.status === 'erro') {
      if (isAv) {
        s.avulsa_erro++
        s.avulsa_erros.push({
          data: em.created_at,
          msg:  em.erro_msg || '(sem mensagem)',
        })
      } else {
        s.rec_erro++
      }
    }
  }

  // ── Monta resposta final ─────────────────────────────────────
  const usuarios = (profiles || []).map(p => ({
    id:            p.id,
    email:         emailByUid[p.id] || p.email_contato || '—',
    company:       p.company_name || '—',
    cnpj:          p.cnpj        || '—',
    cert_ok:       !!p.nfse_cert_path,
    plano:         p.plano_tipo  || null,
    plano_fim:     p.plano_fim   || null,
    created_at:    p.created_at,
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
