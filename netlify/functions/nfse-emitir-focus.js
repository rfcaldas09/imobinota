// Netlify Function — emissão de NFS-e via Focus NFe
// Para municípios que NÃO usam o Emissor Nacional SEFIN (ex: São José/SC)
//
// Fluxo:
//   1. Carrega perfil (focus_token, focus_homologacao, cnpj, inscricao_municipal, etc.)
//   2. Gera ref único para rastreamento no Focus NFe
//   3. Monta payload JSON conforme API Focus NFe v2
//   4. POST para Focus NFe — cria a NFS-e
//   5. Polling GET até status 'autorizado' (até ~12s)
//   6. Salva em nfse_emissoes com chave_acesso = FOCUS:{ref}
//   7. Retorna { ok, numeroNfse, emissaoId }
//
// Docs: https://focusnfe.com.br/doc/#nfse-emissao-de-nfs-e
// Auth: HTTP Basic com token como username e senha vazia

// ── URLs base da API Focus NFe ────────────────────────────────────
const FOCUS_URL_PROD = 'https://api.focusnfe.com.br/v2'
const FOCUS_URL_HOMO = 'https://homologacao.focusnfe.com.br/v2'

exports.handler = async (event) => {
  try {
    return await handle(event)
  } catch (err) {
    console.error('[nfse-emitir-focus] EXCEÇÃO NÃO CAPTURADA:', err?.message, err?.stack)
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

  const { userId, cobId, cobData, homologacao: homoOverride } = body
  if (!userId || !cobData) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId e cobData são obrigatórios' }) }
  }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }

  // ── 1. Carrega perfil ─────────────────────────────────────────
  console.log('[nfse-emitir-focus] carregando perfil userId:', userId)
  const profRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}&select=company_name,cnpj,inscricao_municipal,` +
    `nfse_municipio_ibge,nfse_municipio_nome,nfse_codigo_servico,nfse_desc_servico,` +
    `nfse_ultimo_numero,focus_token,focus_homologacao,` +
    `nfse_logradouro,nfse_numero_end,nfse_bairro,nfse_cep,` +
    `regime_tributario,aliquota_iss`
  )
  if (!profRes.ok) throw new Error(`Erro ao buscar perfil: ${profRes.status}`)
  const profiles = await profRes.json()
  const p = profiles[0]
  if (!p) return { statusCode: 404, body: JSON.stringify({ error: 'Perfil não encontrado' }) }

  if (!p.focus_token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Token Focus NFe não configurado em Configurações → Fiscal → Provedor de Emissão' }) }
  }
  if (!p.cnpj) {
    return { statusCode: 400, body: JSON.stringify({ error: 'CNPJ/CPF do prestador não configurado em Configurações → Empresa' }) }
  }

  // homologação: cobData pode sobrepor perfil (útil para testes pontuais)
  const homologacao = homoOverride !== undefined ? homoOverride : !!p.focus_homologacao
  const FOCUS_BASE  = homologacao ? FOCUS_URL_HOMO : FOCUS_URL_PROD

  // ── 2. Incrementa número RPS ──────────────────────────────────
  const novNumero = (p.nfse_ultimo_numero || 0) + 1
  const updRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}`, 'PATCH', { nfse_ultimo_numero: novNumero }
  )
  if (!updRes.ok) throw new Error('Erro ao incrementar número RPS')
  console.log('[nfse-emitir-focus] numeroRPS:', novNumero)

  // ── 3. Monta payload Focus NFe ────────────────────────────────
  const digits    = v => (v || '').replace(/\D/g, '')
  const cnpjDigits = digits(p.cnpj)
  const isCnpj    = cnpjDigits.length === 14
  const isCpf     = cnpjDigits.length === 11

  // Tomador
  const tomadorCpfCnpj = digits(cobData.cpf || '')
  const isTomadorCnpj  = tomadorCpfCnpj.length === 14
  const isTomadorCpf   = tomadorCpfCnpj.length === 11

  // Código LC 116: "6.04" → "0604" (sem pontos, 4 dígitos)
  function lc116ToFocus(cod) {
    if (!cod) return '0604'
    const [major, minor] = (cod || '').split('.')
    return (major || '6').padStart(2, '0') + (minor || '04').padStart(2, '0')
  }
  const lc116Raw = cobData.codServicoLc116 || p.nfse_codigo_servico || '6.04'
  const itemLista = lc116ToFocus(lc116Raw)

  // Município (IBGE 7 dígitos)
  const ibge7 = digits(cobData.prestMunicipioIbge || p.nfse_municipio_ibge || '').slice(0, 7)

  // UF a partir do IBGE (primeiros 2 dígitos do código estado)
  const ufMap = { '11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO',
                  '21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA',
                  '31':'MG','32':'ES','33':'RJ','35':'SP',
                  '41':'PR','42':'SC','43':'RS',
                  '50':'MS','51':'MT','52':'GO','53':'DF' }
  const ufCode = ibge7.slice(0, 2)
  const uf = ufMap[ufCode] || 'SC'

  // Data/hora emissão (ISO sem timezone, Focus aceita ambas as formas)
  const now = new Date()
  const dataEmissao = now.toISOString().slice(0, 10)

  // Valor
  const valorServicos = parseFloat(cobData.totalValue || cobData.value || 0)
  const aliquota      = parseFloat((p.aliquota_iss || '2').toString().replace(',', '.'))
  const valorIss      = parseFloat((valorServicos * aliquota / 100).toFixed(2))

  // ISS retido
  const issRetido = (cobData.retencoes?.tpRetISSQN || 1) === 2

  // Discriminação do serviço
  const descServico = cobData.discriminacao
    || p.nfse_desc_servico
    || 'Prestação de serviços conforme contrato'

  // Endereço do tomador
  const te = cobData.tomadorEnd || {}
  const tomadorEndereco = (te.cep && te.codMun) ? {
    logradouro:        te.logradouro || 'Endereço não informado',
    numero:            te.numero     || 'S/N',
    bairro:            te.bairro     || '',
    codigo_municipio:  digits(te.codMun).slice(0, 7),
    uf:                ufMap[digits(te.codMun).slice(0, 2)] || uf,
    cep:               digits(te.cep).slice(0, 8),
  } : null

  // Ref único para rastreamento no Focus NFe
  const ref = `imb-${userId.replace(/-/g, '').slice(0, 8)}-${Date.now()}`
  console.log('[nfse-emitir-focus] ref:', ref, '| ibge:', ibge7, '| valor:', valorServicos)

  // Objeto servico (Focus NFe v2 — NFS-e Nacional usa objeto, não array)
  const ret = cobData.retencoes || {}
  const servico = {
    valor_servicos:     valorServicos,
    valor_iss:          valorIss,
    aliquota:           aliquota,
    iss_retido:         issRetido,
    item_lista_servico: itemLista,
    discriminacao:      descServico.slice(0, 2000),
    codigo_municipio:   ibge7,
    // Retenções federais dentro de servico
    ...(ret.pIRRF   ? { valor_ir:     parseFloat((valorServicos * ret.pIRRF   / 100).toFixed(2)) } : {}),
    ...(ret.pCSLL   ? { valor_csll:   parseFloat((valorServicos * ret.pCSLL   / 100).toFixed(2)) } : {}),
    ...(ret.pCOFINS ? { valor_cofins: parseFloat((valorServicos * ret.pCOFINS / 100).toFixed(2)) } : {}),
    ...(ret.pPIS    ? { valor_pis:    parseFloat((valorServicos * ret.pPIS    / 100).toFixed(2)) } : {}),
    ...(ret.pINSS   ? { valor_inss:   parseFloat((valorServicos * ret.pINSS   / 100).toFixed(2)) } : {}),
  }

  // Monta o payload
  const focusPayload = {
    data_emissao:             dataEmissao,
    natureza_operacao:        1, // 1 = Tributação no município
    optante_simples_nacional: p.regime_tributario === '1', // Simples=1, Presumido=2, Real=3
    numero_rps:               String(novNumero),
    serie_rps:                '1',
    tipo_rps:                 'RPS',
    prestador: {
      ...(isCnpj ? { cnpj: cnpjDigits }              : {}),
      ...(isCpf  ? { cpf:  cnpjDigits.slice(-11) }   : {}),
      ...(p.inscricao_municipal ? { inscricao_municipal: p.inscricao_municipal } : {}),
      codigo_municipio: ibge7,
    },
    tomador: {
      ...(isTomadorCnpj ? { cnpj: tomadorCpfCnpj }             : {}),
      ...(isTomadorCpf  ? { cpf:  tomadorCpfCnpj }             : {}),
      razao_social: cobData.tenant || 'Tomador',
      ...(cobData.email ? { email: cobData.email }              : {}),
      ...(tomadorEndereco ? { endereco: tomadorEndereco }       : {}),
    },
    servico,
  }

  console.log('[nfse-emitir-focus] payload:', JSON.stringify(focusPayload))

  // ── 4. POST Focus NFe — cria a NFS-e ─────────────────────────
  const createRes = await focusFetch(
    `${FOCUS_BASE}/nfse?ref=${encodeURIComponent(ref)}`,
    'POST', focusPayload, p.focus_token
  )
  const createBody = await createRes.json()
  console.log('[nfse-emitir-focus] Focus create status:', createRes.status, '| body:', JSON.stringify(createBody))

  if (createRes.status !== 200 && createRes.status !== 202) {
    const errMsg = createBody?.erros?.[0]?.mensagem
      || createBody?.message
      || `Focus NFe HTTP ${createRes.status}`
    return { statusCode: 400, body: JSON.stringify({ error: `Erro ao criar NFS-e no Focus: ${errMsg}`, focusRaw: createBody }) }
  }

  // ── 5. Polling até status 'autorizado' ou 'erro' ─────────────
  const MAX_POLLS   = 6
  const POLL_DELAY  = 2000  // 2s por tentativa → máx 12s
  let focusStatus   = createBody.status || 'processando_autorizacao'
  let focusData     = createBody
  let numeroNfse    = null

  for (let i = 0; i < MAX_POLLS && focusStatus === 'processando_autorizacao'; i++) {
    await delay(POLL_DELAY)
    const statusRes  = await focusFetch(`${FOCUS_BASE}/nfse/${encodeURIComponent(ref)}`, 'GET', null, p.focus_token)
    const statusBody = await statusRes.json()
    console.log(`[nfse-emitir-focus] poll ${i + 1}/${MAX_POLLS} | status:`, statusBody.status)
    focusStatus = statusBody.status || focusStatus
    focusData   = statusBody
    if (focusStatus === 'autorizado') {
      numeroNfse = statusBody.numero || statusBody.numero_nfse || String(novNumero)
    }
  }

  // Erros retornados pelo Focus
  if (focusStatus === 'erro') {
    const errMsg = focusData?.erros?.[0]?.mensagem
      || focusData?.mensagem_sefaz
      || 'NFS-e rejeitada pelo município'
    console.error('[nfse-emitir-focus] NFS-e com ERRO:', JSON.stringify(focusData))
    // Salva como erro no banco para visibilidade
    await saveEmissao(SUPABASE_URL, SERVICE_KEY, {
      userId, cobId, status: 'erro',
      numero_nfse: null, chave_acesso: `FOCUS:${ref}`,
      cobData, tomadorNome: cobData.tenant || '',
      mesRef: cobData.mesRef || '', valor: valorServicos,
      focusRef: ref, focusStatus, errMsg,
    })
    return { statusCode: 400, body: JSON.stringify({ error: errMsg, focusStatus, focusRaw: focusData }) }
  }

  // Ainda processando após polling — salva como "processando" e retorna aviso
  if (focusStatus !== 'autorizado') {
    const emissaoId = await saveEmissao(SUPABASE_URL, SERVICE_KEY, {
      userId, cobId, status: 'processando',
      numero_nfse: null, chave_acesso: `FOCUS:${ref}`,
      cobData, tomadorNome: cobData.tenant || '',
      mesRef: cobData.mesRef || '', valor: valorServicos,
    })
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        processando: true,
        emissaoId,
        focusRef: ref,
        msg: `NFS-e em processamento pela prefeitura (ref: ${ref}). Aguarde alguns segundos e atualize o histórico.`,
      }),
    }
  }

  // ── 6. Autorizado — salva emissão ────────────────────────────
  const emissaoId = await saveEmissao(SUPABASE_URL, SERVICE_KEY, {
    userId, cobId, status: 'emitida',
    numero_nfse: numeroNfse, chave_acesso: `FOCUS:${ref}`,
    cobData, tomadorNome: cobData.tenant || '',
    mesRef: cobData.mesRef || '', valor: valorServicos,
    linkPdf: focusData.link_nfse_pdf || null,
  })

  console.log('[nfse-emitir-focus] AUTORIZADO | numeroNfse:', numeroNfse, '| emissaoId:', emissaoId)

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, numeroNfse, emissaoId, focusRef: ref }),
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(r => setTimeout(r, ms))
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
  const res = await fetch(url, opts)
  return res
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

async function saveEmissao(supabaseUrl, serviceKey, {
  userId, cobId, status,
  numero_nfse, chave_acesso,
  cobData, tomadorNome, mesRef, valor,
  linkPdf = null, errMsg = null,
}) {
  const record = {
    user_id:       userId,
    cob_id:        cobId || null,
    status,
    numero_nfse:   numero_nfse || null,
    chave_acesso:  chave_acesso,
    cob_data_json: cobData,
    tomador_nome:  tomadorNome || '',
    mes_ref:       mesRef || '',
    valor:         valor || 0,
    pdf_link:      linkPdf || null,
    ...(errMsg ? { erro_msg: errMsg } : {}),
  }

  const res = await supabaseFetch(supabaseUrl, serviceKey,
    'nfse_emissoes', 'POST', record
  )

  // Supabase retorna 201 com body quando Prefer: return=representation
  // ou 201 vazio. Tenta extrair o id.
  let inserted
  try {
    const text = await res.text()
    inserted = text ? JSON.parse(text) : null
  } catch { inserted = null }

  return Array.isArray(inserted) ? inserted[0]?.id : inserted?.id || null
}
