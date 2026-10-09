// Netlify Function — cadastro/atualização automática de empresa no Focus NFe
//
// Fluxo white-label: Imobinota é o "integrador" com conta própria no Focus NFe.
// Cada cliente que usa município nac:false tem sua empresa cadastrada AUTOMATICAMENTE
// pelo Imobinota, sem precisar acessar o painel Focus.
//
// O certificado A1 e senha são lidos diretamente do perfil do usuário:
//   - Arquivo .pfx: baixado do Supabase Storage (nfse_cert_path)
//   - Senha:        descriptografada com NFSE_CERT_KEY (nfse_cert_password_enc)
// Não é preciso informar o certificado novamente — usa o mesmo da aba Empresa.
//
// O cliente informa opcionalmente em Config:
//   - Login e senha da prefeitura (municípios com autenticação própria, ex: São José)
//
// Resultado: Focus NFe retorna token_homologacao + token_producao
//   → salvos em profiles.focus_token (homo) e profiles.focus_token_prod (prod)
//
// Auth Focus: FOCUS_MASTER_TOKEN (env var) — token master da conta Imobinota no Focus
// Docs: https://doc.focusnfe.com.br/reference/criar_empresa

const crypto = require('crypto')

const FOCUS_URL_PROD = 'https://api.focusnfe.com.br/v2'

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

  const { userId, loginPrefeitura, senhaPrefeitura } = body
  if (!userId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId é obrigatório' }) }
  }

  const SUPABASE_URL  = process.env.SUPABASE_URL
  const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY
  const MASTER_TOKEN  = process.env.FOCUS_MASTER_TOKEN   // token master Imobinota no Focus NFe
  const CERT_KEY      = process.env.NFSE_CERT_KEY        // chave AES-128 para descriptografar senha do cert

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }
  if (!MASTER_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'FOCUS_MASTER_TOKEN não configurado nas variáveis de ambiente' }) }
  }
  if (!CERT_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'NFSE_CERT_KEY não configurado nas variáveis de ambiente' }) }
  }

  // ── 1. Carrega perfil do usuário ───────────────────────────────
  console.log('[focus-empresa-cadastrar] carregando perfil userId:', userId)
  const profRes = await sbFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}&select=` +
    `company_name,cnpj,inscricao_municipal,email,` +
    `nfse_municipio_ibge,nfse_municipio_nome,` +
    `nfse_logradouro,nfse_numero_end,nfse_bairro,nfse_cep,` +
    `regime_tributario,` +
    `nfse_cert_path,nfse_cert_password_enc`
  )
  if (!profRes.ok) {
    const errBody = await profRes.text().catch(() => '')
    console.error('[focus-empresa-cadastrar] Erro Supabase busca perfil:', profRes.status, errBody)
    throw new Error(`Erro ao buscar perfil: ${profRes.status} — ${errBody}`)
  }
  const profiles = await profRes.json()
  const p = profiles[0]
  if (!p) return { statusCode: 404, body: JSON.stringify({ error: 'Perfil não encontrado' }) }

  // ── 2. Valida campos obrigatórios ──────────────────────────────
  const digits = v => (v || '').replace(/\D/g, '')
  const cnpjDigits = digits(p.cnpj)
  if (cnpjDigits.length < 11) {
    return { statusCode: 400, body: JSON.stringify({ error: 'CNPJ/CPF inválido no perfil. Configure em Configurações → Empresa.' }) }
  }
  if (!p.nfse_municipio_ibge) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Município IBGE não configurado. Configure em Configurações → Fiscal → Município.' }) }
  }
  if (!p.nfse_cert_path) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Certificado digital A1 não encontrado. Faça o upload em Configurações → Empresa.' }) }
  }
  if (!p.nfse_cert_password_enc) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Senha do certificado não encontrada. Informe a senha em Configurações → Empresa e salve.' }) }
  }

  // ── 3. Baixa e descriptografa o certificado ────────────────────
  console.log('[focus-empresa-cadastrar] baixando cert:', p.nfse_cert_path)
  const certBytes = await downloadCert(SUPABASE_URL, SERVICE_KEY, p.nfse_cert_path)
  const certBase64 = certBytes.toString('base64')

  const certSenha = decryptPassword(p.nfse_cert_password_enc, CERT_KEY)
  if (!certSenha) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Falha ao descriptografar a senha do certificado. Verifique NFSE_CERT_KEY.' }) }
  }
  console.log('[focus-empresa-cadastrar] cert ok, tamanho base64:', certBase64.length)

  // ── 4. Monta payload Focus NFe ─────────────────────────────────
  const ibge7  = digits(p.nfse_municipio_ibge).slice(0, 7)
  const isCnpj = cnpjDigits.length === 14
  const regime = parseInt(p.regime_tributario || '3', 10)

  const ufMap = { '11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO',
                  '21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA',
                  '31':'MG','32':'ES','33':'RJ','35':'SP',
                  '41':'PR','42':'SC','43':'RS',
                  '50':'MS','51':'MT','52':'GO','53':'DF' }
  const uf = ufMap[ibge7.slice(0, 2)] || 'SC'
  const municipioNome = (p.nfse_municipio_nome || '').split(' —')[0] || 'Município'

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
    mostrar_danfse_badge:    false,   // white-label: oculta logo Focus NFe no PDF da DANFSe
    arquivo_certificado_base64: certBase64,
    senha_certificado:          certSenha,
    ...(loginPrefeitura ? { login_responsavel: loginPrefeitura } : {}),
    ...(senhaPrefeitura ? { senha_responsavel: senhaPrefeitura } : {}),
  }

  console.log('[focus-empresa-cadastrar] cnpj:', cnpjDigits, '| municipio:', ibge7, '| regime:', regime)

  // ── 5. Tenta criar empresa no Focus (se já existir, atualiza) ──
  let focusRes = await focusFetch(`${FOCUS_URL_PROD}/empresas`, 'POST', focusPayload, MASTER_TOKEN)
  let focusBody = await focusRes.json()
  console.log('[focus-empresa-cadastrar] Focus create status:', focusRes.status, '| codigo:', focusBody?.codigo)

  if (focusRes.status === 422 && focusBody?.erros?.some(e => e.campo === 'cnpj')) {
    console.log('[focus-empresa-cadastrar] CNPJ já cadastrado — buscando id para PUT...')
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

  // ── 6. Salva tokens e credenciais de prefeitura no perfil ──────
  const patchData = {
    focus_token:      tokenHomo,
    focus_token_prod: tokenProd,
    focus_sync_at:    new Date().toISOString(),
    ...(loginPrefeitura !== undefined ? { focus_login_prefeitura: loginPrefeitura || null } : {}),
    ...(senhaPrefeitura !== undefined ? { focus_senha_prefeitura: senhaPrefeitura || null } : {}),
  }

  const updRes = await sbFetch(SUPABASE_URL, SERVICE_KEY, `profiles?id=eq.${userId}`, 'PATCH', patchData)
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

async function downloadCert(supabaseUrl, serviceKey, certPath) {
  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/certificados-nfse/${certPath}`,
    { headers: { 'Authorization': `Bearer ${serviceKey}` } }
  )
  if (!res.ok) throw new Error(`Erro ao baixar certificado: ${res.status}`)
  const buf = await res.arrayBuffer()
  return Buffer.from(buf)
}

function decryptPassword(encHex, keyHex) {
  if (!keyHex || !encHex) return ''
  try {
    const key      = Buffer.from(keyHex, 'hex')
    const ivHex    = encHex.slice(0, 32)
    const ctHex    = encHex.slice(32)
    const iv       = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv)
    return decipher.update(ctHex, 'hex', 'utf8') + decipher.final('utf8')
  } catch {
    return ''
  }
}

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
      ...(method === 'PATCH' ? { 'Prefer': 'return=minimal' } : {}),
    },
  }
  if (body) opts.body = JSON.stringify(body)
  return fetch(`${url}/rest/v1/${path}`, opts)
}
