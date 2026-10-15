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
    `nfse_ultimo_numero,focus_token,focus_token_prod,focus_homologacao,focus_nfse_legado,` +
    `nfse_logradouro,nfse_numero_end,nfse_bairro,nfse_cep,` +
    `regime_tributario,aliquota_iss,nfse_nbs`
  )
  if (!profRes.ok) throw new Error(`Erro ao buscar perfil: ${profRes.status}`)
  const profiles = await profRes.json()
  const p = profiles[0]
  if (!p) return { statusCode: 404, body: JSON.stringify({ error: 'Perfil não encontrado' }) }

  if (!p.focus_token && !p.focus_token_prod) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Token Focus NFe não configurado em Configurações → Fiscal → Provedor de Emissão' }) }
  }
  if (!p.cnpj) {
    return { statusCode: 400, body: JSON.stringify({ error: 'CNPJ/CPF do prestador não configurado em Configurações → Empresa' }) }
  }

  // homologação: cobData pode sobrepor perfil (útil para testes pontuais)
  const homologacao = homoOverride !== undefined ? homoOverride : !!p.focus_homologacao
  const FOCUS_BASE  = homologacao ? FOCUS_URL_HOMO : FOCUS_URL_PROD

  // Seleciona o token correto conforme o ambiente
  // focus_token       = token de homologação
  // focus_token_prod  = token de produção
  const focusToken = homologacao ? p.focus_token : (p.focus_token_prod || p.focus_token)
  if (!focusToken) {
    const missing = homologacao ? 'homologação' : 'produção'
    return { statusCode: 400, body: JSON.stringify({ error: `Token de ${missing} não encontrado. Clique em "Atualizar cadastro na Focus NFe" em Configurações → Fiscal.` }) }
  }

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

  // Código LC 116 → Código de Tributação Nacional (6 dígitos: 2 item + 2 subitem + 2 desdobro)
  // Focus NFe / NFS-e Nacional exige exatamente 6 dígitos. O desdobro nunca é "00" —
  // começa em "01" (ex: LC 116 "1.07" → cTribNac "010701", "6.04" → "060401")
  // Referência: https://buscadorncm.com.br/nfse/ctribnac
  function lc116ToFocus(cod) {
    if (!cod) return '060401'
    const [major, minor] = (cod || '').split('.')
    return (major || '6').padStart(2, '0') + (minor || '04').padStart(2, '0') + '01'
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

  const isSimples = p.regime_tributario === 'simples'

  // ── Decide modo: legado (/nfse) ou nacional (/nfsen) ─────────
  const nfseIsLegado = !!p.focus_nfse_legado
  console.log('[nfse-emitir-focus] modo NFS-e:', nfseIsLegado ? 'LEGADO (/nfse)' : 'NACIONAL (/nfsen)')

  const ret = cobData.retencoes || {}
  let focusPayload, focusEndpoint

  if (nfseIsLegado) {
    // ── Payload formato LEGADO /nfse ─────────────────────────────
    // Formato aninhado: { prestador, tomador, servico }
    // Usado por municípios com sistema próprio (São José/SC, etc.)
    // Formato IPM/AtendeNet (São José/SC): remove o ponto e adiciona desdobramento '01'
    // Ref: https://focusnfe.com.br/guides/nfse/municipios-integrados/sao-jose-sc/
    // Erro 00383 "não possui desdobramento nacional" ocorre sem o sufixo '01'
    // Exemplo: "1.07" → "10701", "4.12" → "41201", "6.04" → "60401"
    const lc116Item4d = (lc116Raw || '6.04').replace('.', '') + '01'

    // NBS (Nomenclatura Brasileira de Serviços) — Reforma Tributária (RT)
    // Alguns municípios IPM exigem este campo a partir de 01/10/2026
    // Ref: https://doc.focusnfe.com.br/reference/emitir_nfse (campo codigo_nbs)
    const codigoNbs = cobData.codigoNbs || p.nfse_nbs || null

    focusEndpoint = `${FOCUS_BASE}/nfse?ref=${encodeURIComponent(ref)}`
    focusPayload = {
      data_emissao:             `${dataEmissao}T00:00:00-0300`,
      natureza_operacao:        1,              // 1 = Tributação no município
      optante_simples_nacional: isSimples,
      incentivador_cultural:    false,
      regime_especial_tributacao: isSimples ? 6 : undefined, // 6 = ME/EPP Simples Nacional

      // ─ Prestador ─
      prestador: {
        ...(isCnpj ? { cnpj: cnpjDigits }              : {}),
        ...(isCpf  ? { cpf:  cnpjDigits.slice(-11) }   : {}),
        inscricao_municipal: (p.inscricao_municipal || '').replace(/\D/g, '') || undefined,
        codigo_municipio:    ibge7,
      },

      // ─ Tomador ─
      tomador: {
        ...(isTomadorCnpj ? { cnpj: tomadorCpfCnpj } : {}),
        ...(isTomadorCpf  ? { cpf:  tomadorCpfCnpj } : {}),
        razao_social: cobData.tenant || 'Tomador',
        ...(cobData.email ? { email: cobData.email } : {}),
        ...(tomadorEndereco ? {
          endereco: {
            logradouro:      tomadorEndereco.logradouro,
            numero:          tomadorEndereco.numero,
            bairro:          tomadorEndereco.bairro || '',
            codigo_municipio: tomadorEndereco.codigo_municipio,
            uf:              tomadorEndereco.uf,
            cep:             tomadorEndereco.cep,
          },
        } : {}),
      },

      // ─ Serviço ─
      servico: {
        valor_servicos:             valorServicos,
        iss_retido:                 issRetido,
        ...(issRetido ? { valor_iss_retido: parseFloat((valorServicos * aliquota / 100).toFixed(2)) } : {}),
        valor_iss:                  parseFloat((valorServicos * aliquota / 100).toFixed(2)),
        aliquota:                   aliquota,        // Percentual direto: 2 (não 0.02) — padrão IPM/AtendeNet
        item_lista_servico:         lc116Item4d,     // Sem ponto sem padding: "107" para "1.07"
        situacao_tributaria:        '0',             // Obrigatório para São José/SC (AtendeNet)
        ...(codigoNbs ? { codigo_nbs: codigoNbs } : {}), // RT: NBS opcional, exigido por alguns municípios IPM
        discriminacao:              descServico.slice(0, 2000),
        codigo_municipio:           ibge7,
        // Retenções federais
        ...(ret.pIRRF   ? { valor_ir:    parseFloat((valorServicos * ret.pIRRF   / 100).toFixed(2)) } : {}),
        ...(ret.pINSS   ? { valor_inss:  parseFloat((valorServicos * ret.pINSS   / 100).toFixed(2)) } : {}),
        ...(ret.pCSLL   ? { valor_csll:  parseFloat((valorServicos * ret.pCSLL   / 100).toFixed(2)) } : {}),
        ...(ret.pPIS    ? { valor_pis:   parseFloat((valorServicos * ret.pPIS    / 100).toFixed(2)) } : {}),
        ...(ret.pCOFINS ? { valor_cofins: parseFloat((valorServicos * ret.pCOFINS / 100).toFixed(2)) } : {}),
      },
    }

    // Remove campos undefined recursivamente
    focusPayload = JSON.parse(JSON.stringify(focusPayload))

  } else {
    // ── Payload formato NACIONAL /nfsen ───────────────────────────
    // Formato plano (flat), padrão DPS da SEFIN.
    // IMPORTANTE: usar percentual_total_tributos_* para não-SN (evita E0713)

    const totTribFields = isSimples
      ? { percentual_total_tributos_simples_nacional: aliquota }
      : {
          percentual_total_tributos_federais:   0,
          percentual_total_tributos_estaduais:  0,
          percentual_total_tributos_municipais: aliquota,
        }

    focusEndpoint = `${FOCUS_BASE}/nfsen?ref=${encodeURIComponent(ref)}`
    focusPayload = {
      data_emissao:                   `${dataEmissao}T00:00:00-0300`,
      serie_dps:                      1,
      numero_dps:                     novNumero,
      data_competencia:               dataEmissao,
      emitente_dps:                   1,   // 1 = Prestador
      codigo_municipio_emissora:      parseInt(ibge7),

      ...(isCnpj ? { cnpj_prestador: cnpjDigits }            : {}),
      ...(isCpf  ? { cpf_prestador:  cnpjDigits.slice(-11) } : {}),
      codigo_opcao_simples_nacional:  isSimples ? 3 : 1,
      regime_especial_tributacao:     0,

      ...(isTomadorCnpj ? { cnpj_tomador: tomadorCpfCnpj }             : {}),
      ...(isTomadorCpf  ? { cpf_tomador:  tomadorCpfCnpj }             : {}),
      ...(!isTomadorCnpj && !isTomadorCpf ? { motivo_ausencia_nif_tomador: 1 } : {}),
      razao_social_tomador:           cobData.tenant || 'Tomador',
      ...(cobData.email ? { email_tomador: cobData.email }              : {}),
      ...(tomadorEndereco ? {
        logradouro_tomador:           tomadorEndereco.logradouro,
        numero_tomador:               tomadorEndereco.numero,
        bairro_tomador:               tomadorEndereco.bairro || '',
        codigo_municipio_tomador:     parseInt(tomadorEndereco.codigo_municipio),
        cep_tomador:                  parseInt(tomadorEndereco.cep),
      } : {}),

      codigo_municipio_prestacao:     ibge7,
      codigo_tributacao_nacional_iss: itemLista,
      descricao_servico:              descServico.slice(0, 1000),
      valor_servico:                  valorServicos,
      tributacao_iss:                 1,
      tipo_retencao_iss:              issRetido ? 2 : 1,
      ...totTribFields,

      ...(ret.pIRRF ? { valor_irrf: parseFloat((valorServicos * ret.pIRRF / 100).toFixed(2)) } : {}),
      ...(() => {
        const vCSLL   = ret.pCSLL   ? valorServicos * ret.pCSLL   / 100 : 0
        const vPIS    = ret.pPIS    ? valorServicos * ret.pPIS    / 100 : 0
        const vCOFINS = ret.pCOFINS ? valorServicos * ret.pCOFINS / 100 : 0
        const total   = parseFloat((vCSLL + vPIS + vCOFINS).toFixed(2))
        return total > 0 ? { valor_csll: total } : {}
      })(),
      ...(ret.pINSS ? { valor_cp: parseFloat((valorServicos * ret.pINSS / 100).toFixed(2)) } : {}),
    }
  }

  console.log('[nfse-emitir-focus] endpoint:', focusEndpoint.replace(FOCUS_BASE, ''))
  console.log('[nfse-emitir-focus] payload:', JSON.stringify(focusPayload))

  // ── 4. POST Focus NFe ─────────────────────────────────────────
  const createRes = await focusFetch(focusEndpoint, 'POST', focusPayload, focusToken)
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

  // Endpoint de consulta (GET) também varia conforme o modo
  const focusConsultaBase = nfseIsLegado
    ? `${FOCUS_BASE}/nfse/${encodeURIComponent(ref)}`
    : `${FOCUS_BASE}/nfsen/${encodeURIComponent(ref)}`

  for (let i = 0; i < MAX_POLLS && focusStatus === 'processando_autorizacao'; i++) {
    await delay(POLL_DELAY)
    // ?completo=1 faz o Focus retornar o XML completo enviado à prefeitura — vital para diagnóstico
    const statusRes  = await focusFetch(`${focusConsultaBase}?completo=1`, 'GET', null, focusToken)
    const statusBody = await statusRes.json()
    console.log(`[nfse-emitir-focus] poll ${i + 1}/${MAX_POLLS} | status:`, statusBody.status)
    // Log diagnóstico: mostra TODAS as chaves retornadas pelo Focus com completo=1
    if (statusBody.status === 'erro_autorizacao' || statusBody.status === 'erro') {
      console.error('[nfse-emitir-focus] body completo:', JSON.stringify(statusBody))
    }
    focusStatus = statusBody.status || focusStatus
    focusData   = statusBody
    if (focusStatus === 'autorizado') {
      numeroNfse = statusBody.numero || statusBody.numero_nfse || String(novNumero)
      // Log completo para diagnóstico — mostra todos os campos retornados pelo Focus
      console.log('[nfse-emitir-focus] focusData autorizado (keys):', Object.keys(statusBody).join(', '))
      console.log('[nfse-emitir-focus] focusData autorizado:', JSON.stringify(statusBody))
    }
  }

  // Erros retornados pelo Focus (inclui erro_autorizacao = rejeitado pela prefeitura)
  if (focusStatus === 'erro' || focusStatus === 'erro_autorizacao') {
    const errMsg = focusData?.erros?.[0]?.mensagem
      || focusData?.mensagem_sefaz
      || focusData?.erros?.[0]?.codigo
      || `NFS-e rejeitada pelo município (${focusStatus})`
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

  // ── 6. Autorizado — busca XML e salva emissão ────────────────
  // mesRef: usa o da cobData ou, se ausente (nota avulsa), o mês atual (YYYY-MM)
  const mesRefFinal = cobData.mesRef
    || new Date().toISOString().slice(0, 7)

  // Tenta buscar conteúdo XML da NFS-e retornado pelo Focus NFe
  // Focus retorna caminho_xml_nota_fiscal como caminho relativo (ex: /arquivos_development/...)
  // Precisa prefixar o domínio base do Focus e autenticar com Basic Auth
  let xmlNfse = null
  const xmlCaminho = focusData.caminho_xml_nota_fiscal
    || focusData.url_xml
    || focusData.arquivo_xml
    || focusData.xml_url
    || null

  if (xmlCaminho) {
    // Se for caminho relativo, monta URL completa com domínio base do Focus
    const focusBaseDomain = FOCUS_BASE.replace('/v2', '') // ex: https://homologacao.focusnfe.com.br
    const xmlFullUrl = xmlCaminho.startsWith('http') ? xmlCaminho : `${focusBaseDomain}${xmlCaminho}`
    console.log('[nfse-emitir-focus] buscando XML em:', xmlFullUrl)
    try {
      const xmlRes = await focusFetch(xmlFullUrl, 'GET', null, focusToken)
      if (xmlRes.ok) {
        xmlNfse = await xmlRes.text()
        console.log('[nfse-emitir-focus] XML obtido, tamanho:', xmlNfse.length)
      } else {
        console.warn('[nfse-emitir-focus] Falha ao buscar XML, HTTP:', xmlRes.status, 'url:', xmlFullUrl)
      }
    } catch (e) {
      console.warn('[nfse-emitir-focus] Erro ao buscar XML:', e.message)
    }
  } else {
    console.log('[nfse-emitir-focus] Nenhuma URL de XML retornada pelo Focus (campos:', Object.keys(focusData).join(', '), ')')
  }

  const emissaoId = await saveEmissao(SUPABASE_URL, SERVICE_KEY, {
    userId, cobId, status: 'emitida',
    numero_nfse: numeroNfse, chave_acesso: `FOCUS:${ref}`,
    cobData, tomadorNome: cobData.tenant || '',
    mesRef: mesRefFinal, valor: valorServicos,
    xmlNfse,
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
  const prefer = method === 'PATCH'  ? 'return=minimal'
               : method === 'POST'   ? 'return=representation'
               : undefined
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

async function saveEmissao(supabaseUrl, serviceKey, {
  userId, cobId, status,
  numero_nfse, chave_acesso,
  cobData, tomadorNome, mesRef, valor,
  xmlNfse = null, errMsg = null,
}) {
  const record = {
    user_id:       userId,
    cobranca_id:   cobId || null,
    status,
    numero_nfse:   numero_nfse || null,
    chave_acesso:  chave_acesso,
    cob_data_json: cobData,
    tomador_nome:  tomadorNome || '',
    competencia:   mesRef || '',
    valor_servico: valor || 0,
    ...(xmlNfse ? { xml_nfse: xmlNfse } : {}),
    ...(errMsg   ? { erro_msg: errMsg } : {}),
  }

  const res = await supabaseFetch(supabaseUrl, serviceKey,
    'nfse_emissoes', 'POST', record
  )

  // Supabase retorna 201 com body quando Prefer: return=representation
  let inserted
  try {
    const text = await res.text()
    if (!res.ok) {
      console.error('[saveEmissao] INSERT falhou HTTP', res.status, text)
      return null
    }
    inserted = text ? JSON.parse(text) : null
    console.log('[saveEmissao] INSERT ok | status:', res.status, '| id:', Array.isArray(inserted) ? inserted[0]?.id : inserted?.id)
  } catch (e) {
    console.error('[saveEmissao] erro ao parsear resposta:', e.message)
    inserted = null
  }

  return Array.isArray(inserted) ? inserted[0]?.id : inserted?.id || null
}
