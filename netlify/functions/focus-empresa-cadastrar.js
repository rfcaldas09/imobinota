// Netlify Function — cadastro/atualização automática de empresa no Focus NFe
//
// Fluxo white-label: Imobinota é o "integrador" com conta própria no Focus NFe.
// Cada cliente que usa município nac:false tem sua empresa cadastrada AUTOMATICAMENTE
// pelo Imobinota, sem precisar acessar o painel Focus.
//
// O cliente fornece no Config:
//   - Certificado A1 (arquivo .pfx/.p12 → base64, NÃO é armazenado no banco)
//   - Senha do certificado
//   - Login e senha da prefeitura (municípios que usam autenticação própria, ex: São José)
//
// Resultado: Focus NFe retorna token_homologacao + token_producao
//   → salvos em profiles.focus_token (homo) e profiles.focus_token_prod (prod)
//
// Auth Focus: FOCUS_MASTER_TOKEN (env var) — token master da conta Imobinota no Focus
// Docs: https://doc.focusnfe.com.br/reference/criar_empresa

const FOCUS_URL_PROD = 'https://api.focusnfe.com.br/v2'
const FOCUS_URL_HOMO = 'https://homologacao.focusnfe.com.br/v2' // apenas para consulta; empresa é criada sempre em prod

exports.handler = async (event) => {
  try {
    return await handle(event)
  } catch (err) {
    console.error('[focus-empresa-cadastrar] EXCEÇÃO:', err?.message, err?.stack)
    return { statusCode: 500, body: JSON.stringify({ error: `Erro interno: ${err?.message}` }) }
  }
}

async function handle(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { userId, certBase64, certSenha, loginPrefeitura, senhaPrefeitura } = body
  if (!userId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId é obrigatório' }) }
  }
  if (!certBase64 || !certSenha) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Certificado A1 e senha são obrigatórios' }) }
  }

  const SUPABASE_URL   = process.env.SUPABASE_URL
  const SERVICE_KEY    = process.env.SUPABASE_SERVICE_KEY
  const MASTER_TOKEN   = process.env.FOCUS_MASTER_TOKEN   // token master Imobinota no Focus NFe
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }
  if (!MASTER_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'FOCUS_MASTER_TOKEN não configurado nas variáveis de ambiente' }) }
  }

  // ── 1. Carrega perfil do usuário ───────────────────────────────
  console.log('[focus-empresa-cadastrar] carregando perfil userId:', userId)
  const profRes = await sbFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}&select=` +
    `company_name,cnpj,inscricao_municipal,email,` +
    `nfse_municipio_ibge,nfse_municipio_nome,` +
    `nfse_logradouro,nfse_numero_end,nfse_bairro,nfse_cep,` +
    `regime_tributario,focus_homologacao`
  )
  if (!profRes.ok) throw new Error(`Erro ao buscar perfil: ${profRes.status}`)
  const profiles = await profRes.json()
  const p = profiles[0]
  if (!p) return { statusCode: 404, body: JSON.stringify({ error: 'Perfil não encontrado' }) }

  const digits = v => (v || '').replace(/\D/g, '')
  const cnpjDigits = digits(p.cnpj)
  if (cnpjDigits.length < 11) {
    return { statusCode: 400, body: JSON.stringify({ error: 'CNPJ/CPF inválido no perfil. Configure em Configurações → Empresa.' }) }
  }
  if (!p.nfse_municipio_ibge) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Município IBGE não configurado. Configure em Configurações → Fiscal → Município.' }) }
  }

  const ibge7   = digits(p.nfse_municipio_ibge).slice(0, 7)
  const isCnpj  = cnpjDigits.length === 14

  // Regime tributário: Focus usa 1=Simples, 2=SimpExcesso, 3=Normal, 4=MEI
  // Nosso DB usa os mesmos valores
  const regime = parseInt(p.regime_tributario || '3', 10)

  // UF a partir do IBGE
  const ufMap = { '11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO',
                  '21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA',
                  '31':'MG','32':'ES','33':'RJ','35':'SP',
                  '41':'PR','42':'SC','43':'RS',
                  '50':'MS','51':'MT','52':'GO','53':'DF' }
  const uf = ufMap[ibge7.slice(0, 2)] || 'SC'
  const municipioNome = (p.nfse_municipio_nome || '').split(' —')[0] || 'Município'

  // ── 2. Monta payload Focus NFe ─────────────────────────────────
  const focusPayload = {
    nome:                    p.company_name || 'Empresa',
    ...(isCnpj ? { cnpj: cnpjDigits } : { cpf: cnpjDigits }),
    ...(p.inscricao_municipal ? { inscricao_municipal: parseInt(digits(p.inscricao_municipal), 10) || undefined } : {}),
    regime_tributario:       regime,
    logradouro:              p.nfse_logradouro || 'Endereço não informado',
    numero:                  parseInt(p.nfse_numero_end || '0', 10) || 0,
    bairro:                  p.nfse_bairro     || 'Centro',
    cep:                     parseInt(digits(p.nfse_cep || '00000000'), 10),
    municipio:               municipioNome,
    uf,
    ...(p.email ? { email: p.email } : {}),
    habilita_nfse:           true,
    // Certificado A1 (base64 do arquivo PFX/P12)
    arquivo_certificado_base64: certBase64,
    senha_certificado:          certSenha,
    // Login/senha da prefeitura (municípios que usam autenticação própria, ex: São José)
    ...(loginPrefeitura ? { login_responsavel: loginPrefeitura } : {}),
    ...(senhaPrefeitura ? { senha_responsavel: senhaPrefeitura } : {}),
  }

  console.log('[focus-empresa-cadastrar] cnpj:', cnpjDigits, '| municipio:', ibge7, '| regime:', regime)

  // ── 3. Tenta criar empresa no Focus (se já existir, atualiza) ──
  let focusRes = await focusFetch(`${FOCUS_URL_PROD}/empresas`, 'POST', focusPayload, MASTER_TOKEN)
  let focusBody = await focusRes.json()
  console.log('[focus-empresa-cadastrar] Focus create status:', focusRes.status, '| codigo:', focusBody?.codigo)

  // Se empresa já existe (422 com "cnpj já cadastrado"), tenta atualizar via PATCH
  if (focusRes.status === 422 && focusBody?.erros?.some(e => e.campo === 'cnpj')) {
    console.log('[focus-empresa-cadastrar] CNPJ já cadastrado — buscando id para PATCH...')
    const listRes  = await focusFetch(`${FOCUS_URL_PROD}/empresas?cnpj=${cnpjDigits}`, 'GET', null, MASTER_TOKEN)
    const listBody = await listRes.json()
    const empresaId = Array.isArray(listBody) ? listBody[0]?.id : null

    if (empresaId) {
      console.log('[focus-empresa-cadastrar] atualizando empresa id:', empresaId)
      focusRes  = await focusFetch(`${FOCUS_URL_PROD}/empresas/${empresaId}`, 'PUT', focusPayload, MASTER_TOKEN)
      focusBody = await focusRes.json()
      console.log('[focus-empresa-cadastrar] Focus update status:', focusRes.status)
    }
  }

  if (focusRes.status !== 200 && focusRes.status !== 201) {
    const errMsg = focusBody?.erros?.[0]?.mensagem || focusBody?.mensagem || `Focus HTTP ${focusRes.status}`
    console.error('[focus-empresa-cadastrar] Erro Focus:', JSON.stringify(focusBody))
    return { statusCode: 400, body: JSON.stringify({ error: `Erro ao cadastrar no Focus NFe: ${errMsg}`, focusRaw: focusBody }) }
  }

  const tokenHomo = focusBody.token_homologacao || null
  const tokenProd = focusBody.token_producao    || null
  console.log('[focus-empresa-cadastrar] ✅ empresa cadastrada | tokenHomo:', tokenHomo ? 'ok' : 'null', '| tokenProd:', tokenProd ? 'ok' : 'null')

  // ── 4. Salva tokens e credenciais de prefeitura no perfil ──────
  const patchData = {
    focus_token:              tokenHomo,   // token homo = foco atual (emissão usa focus_homologacao flag)
    focus_token_prod:         tokenProd,
    focus_sync_at:            new Date().toISOString(),
    // Login/senha da prefeitura (para reenvio sem precisar re-informar)
    ...(loginPrefeitura !== undefined ? { focus_login_prefeitura: loginPrefeitura || null } : {}),
    ...(senhaPrefeitura !== undefined ? { focus_senha_prefeitura: senhaPrefeitura || null } : {}),
  }

  const updRes = await sbFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}`, 'PATCH', patchData
  )
  if (!updRes.ok) {
    console.error('[focus-empresa-cadastrar] Erro ao salvar tokens no perfil:', updRes.status)
    throw new Error('Empresa cadastrada no Focus mas erro ao salvar token no perfil')
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      tokenHomo: !!tokenHomo,
      tokenProd: !!tokenProd,
      msg: 'Empresa cadastrada/atualizada com sucesso no Focus NFe. Tokens salvos.',
    }),
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

function sbFetch(url, key, path, method = 'GET', body) {
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
