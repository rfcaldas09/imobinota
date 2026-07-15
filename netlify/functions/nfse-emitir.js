// Netlify Function — emissão de NFS-e via Sistema Nacional NFS-e (SEFIN)
// Fluxo:
//   1. Baixa o certificado .pfx do Supabase Storage
//   2. Incrementa o número sequencial de DPS no profile do usuário
//   3. Monta o XML da DPS conforme leiaute nacional v1.01
//   4. Assina o XML com XMLDSig RSA-SHA256
//   5. GZip + Base64 → POST JSON com mTLS na API do SEFIN Nacional
//   6. Grava resultado em nfse_emissoes no Supabase

const https      = require('https')
const forge      = require('node-forge')
const crypto     = require('crypto')
const zlib       = require('zlib')
const xmlCrypto  = require('xml-crypto')

// ── URLs do SEFIN Nacional ────────────────────────────────────────
// Produção:    POST https://sefin.nfse.gov.br/SefinNacional/nfse
// Homologação: POST https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse
const SEFIN_URL_PROD = 'https://sefin.nfse.gov.br/SefinNacional/nfse'
const SEFIN_URL_TEST = 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse'

// ── Chave de criptografia para senha do cert (variável de ambiente) ─
const CERT_KEY = process.env.NFSE_CERT_KEY // 32-char hex string → 128-bit key

// ── Helpers gzip/gunzip ───────────────────────────────────────────
function gzipBuffer(buf) {
  return new Promise((resolve, reject) =>
    zlib.gzip(buf, (err, result) => err ? reject(err) : resolve(result))
  )
}
function gunzipBuffer(buf) {
  return new Promise((resolve, reject) =>
    zlib.gunzip(buf, (err, result) => err ? reject(err) : resolve(result))
  )
}

exports.handler = async (event) => {
  try {
    return await handle(event)
  } catch (err) {
    console.error('[nfse-emitir] EXCEÇÃO NÃO CAPTURADA:', err?.message, err?.stack)
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

  const { userId, cobId, cobData, homologacao = false } = body
  // cobData = { mesRef, tenant, cpf, email, property, totalValue, value,
  //             seguroFinanceiro, seguroIncendio, iptu }

  if (!userId || !cobId || !cobData) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId, cobId e cobData são obrigatórios' }) }
  }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }

  // ── 1. Carrega configuração NFS-e do perfil ─────────────────────
  console.log('[nfse-emitir] carregando perfil userId:', userId)
  const profRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}&select=company_name,cnpj,inscricao_municipal,` +
    `nfse_municipio_ibge,nfse_municipio_nome,nfse_codigo_servico,nfse_serie,` +
    `nfse_ultimo_numero,nfse_cert_path,nfse_cert_password_enc,` +
    `nfse_logradouro,nfse_numero_end,nfse_bairro,nfse_cep,` +
    `regime_tributario,aliquota_iss`
  )
  if (!profRes.ok) throw new Error(`Erro ao buscar perfil: ${profRes.status}`)
  const profiles = await profRes.json()
  const p = profiles[0]
  if (!p) return { statusCode: 404, body: JSON.stringify({ error: 'Perfil não encontrado' }) }

  // Validações de config
  if (!p.cnpj) return { statusCode: 400, body: JSON.stringify({ error: 'CNPJ/CPF do prestador não configurado em Configurações → Empresa' }) }
  if (!p.inscricao_municipal) return { statusCode: 400, body: JSON.stringify({ error: 'Inscrição Municipal não configurada em Configurações → Empresa' }) }
  if (!p.nfse_municipio_ibge) return { statusCode: 400, body: JSON.stringify({ error: 'Código IBGE do município não configurado em Configurações → Fiscal' }) }
  if (!p.nfse_cert_path) return { statusCode: 400, body: JSON.stringify({ error: 'Certificado digital A1 não enviado em Configurações → Empresa' }) }
  if (!p.aliquota_iss) return { statusCode: 400, body: JSON.stringify({ error: 'Alíquota ISS não configurada em Configurações → Fiscal' }) }

  // ── 2. Incrementa número da DPS ───────────────────────────────
  const novNumero = (p.nfse_ultimo_numero || 0) + 1
  const updRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}`,
    'PATCH', { nfse_ultimo_numero: novNumero }
  )
  if (!updRes.ok) throw new Error('Erro ao incrementar número DPS')
  console.log('[nfse-emitir] numeroDPS:', novNumero)

  // ── 3. Baixa o certificado do Storage ──────────────────────────
  const certBytes = await downloadCert(SUPABASE_URL, SERVICE_KEY, p.nfse_cert_path)
  console.log('[nfse-emitir] cert baixado, tamanho bytes:', certBytes.length, '| path:', p.nfse_cert_path)

  if (!p.nfse_cert_password_enc) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Senha do certificado não encontrada. Acesse Configurações → NFS-e, informe a senha e salve.' }) }
  }
  if (!CERT_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'NFSE_CERT_KEY não configurada nas variáveis de ambiente do servidor.' }) }
  }

  const certPassword = decryptPassword(p.nfse_cert_password_enc, CERT_KEY)
  if (!certPassword) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Falha ao descriptografar a senha do certificado. Verifique se NFSE_CERT_KEY no servidor é a mesma usada no upload.' }) }
  }
  console.log('[nfse-emitir] certPassword decriptada OK, tamanho:', certPassword.length, '| enc length:', p.nfse_cert_password_enc.length)

  // ── 4. Extrai chave privada e certificado do .pfx ──────────────
  const { privateKey, certPem, certForge } = parsePfx(certBytes, certPassword)

  // ── 5. Monta XML da DPS ────────────────────────────────────────
  // Série: deve ser numérica (5 dígitos) para o Id do DPS ser válido (padrão DPS[0-9]{42})
  // Se o usuário configurou série alfanumérica (ex: "IMOB"), usa "00001" como fallback numérico
  const serieRaw = (p.nfse_serie || '').replace(/\D/g, '').slice(0, 5).padStart(5, '0') || '00001'

  const config = {
    cnpj:          digits(p.cnpj),
    inscMun:       p.inscricao_municipal,
    razaoSocial:   p.company_name || 'Prestador',
    municipioIbge: p.nfse_municipio_ibge,
    serie:         serieRaw,
    numero:        novNumero,
    // cTribNac: código de tributação nacional (6 dígitos)
    // "100901" = Administração de bens e negócios (LC 116 item 10.09)
    cTribNac:      '100901',
    // cTribMun: código de serviço municipal (conforme tabela da prefeitura, opcional no XSD)
    // Só inclui se o usuário configurou um código puramente numérico em Configurações → Fiscal
    // (o código LC116 "6.05" não serve aqui — precisa ser o código numérico da prefeitura)
    cTribMun:      /^\d+$/.test((p.nfse_codigo_servico || '').trim()) ? p.nfse_codigo_servico.trim() : null,
    aliquota:      parseFloat((p.aliquota_iss || '2').toString().replace(',', '.')).toFixed(2),
    logradouro:    p.nfse_logradouro || 'Endereço não informado',
    numeroEnd:     p.nfse_numero_end || 's/n',
    bairro:        p.nfse_bairro || '',
    cep:           digits(p.nfse_cep || '').slice(0, 8),
    // regime: 'simples' | 'lucro_presumido' | outros
    regime:        (p.regime_tributario || 'simples'),
  }

  let dpsXml
  try {
    dpsXml = buildDpsXml(config, cobData, homologacao)
  } catch (validErr) {
    // Erros de validação de dados (CPF/CNPJ inválido etc.) → 400 com mensagem amigável
    return { statusCode: 400, body: JSON.stringify({ error: validErr.message }) }
  }
  console.log('[nfse-emitir] DPS gerada, assinando...')
  console.log('[nfse-emitir] DPS XML (primeiros 800 chars):', dpsXml.slice(0, 800))

  // ── 6. Assina o XML ─────────────────────────────────────────────
  const dpsAssinada = signDps(dpsXml, privateKey, certForge)
  console.log('[nfse-emitir] DPS assinada, tamanho:', dpsAssinada.length)

  // ── 7. Envia para o SEFIN (GZip + Base64 + JSON com mTLS) ──────
  const sefinUrl = homologacao ? SEFIN_URL_TEST : SEFIN_URL_PROD
  console.log('[nfse-emitir] enviando para SEFIN:', sefinUrl, '| homologacao:', homologacao)

  const { status: httpStatus, body: responseBody } = await postWithMtls(
    sefinUrl, dpsAssinada, certPem, forge.pki.privateKeyToPem(privateKey)
  )
  console.log('[nfse-emitir] SEFIN status:', httpStatus, '| body:', responseBody.slice(0, 500))

  // SEFIN retorna 201 para sucesso
  if (httpStatus !== 201) {
    // Extrai mensagem legível dos erros do SEFIN (formato JSON { erros: [{Codigo, Descricao, Complemento}] })
    let userMessage = `Erro na comunicação com o SEFIN (HTTP ${httpStatus})`
    try {
      const errJson = JSON.parse(responseBody)
      const erros = errJson.erros || []
      if (erros.length > 0) {
        userMessage = erros.map(e => {
          const cod   = e.Codigo      || e.codigo      || ''
          const desc  = e.Descricao   || e.descricao   || ''
          const compl = e.Complemento || e.complemento || ''
          return cod ? `[${cod}] ${desc}${compl ? ': ' + compl : ''}` : desc
        }).join('\n')
      }
    } catch { userMessage = responseBody.slice(0, 500) || userMessage }

    await gravarEmissao(SUPABASE_URL, SERVICE_KEY, {
      user_id: userId, cobranca_id: cobId,
      numero_dps: novNumero, competencia: cobData.mesRef,
      valor_servico: cobData.totalValue,
      status: 'erro', erro_msg: userMessage,
    })
    return {
      statusCode: 400,
      body: JSON.stringify({ error: userMessage }),
    }
  }

  // ── 8. Decodifica resposta JSON do SEFIN ───────────────────────
  let responseJson
  try { responseJson = JSON.parse(responseBody) } catch {
    throw new Error('Resposta do SEFIN não é JSON válido: ' + responseBody.slice(0, 200))
  }

  const chaveAcesso = responseJson.chaveAcesso
  const idDps       = responseJson.idDps

  // Decodifica o XML da NFS-e autorizada (GZip + Base64)
  let nfseXml = ''
  if (responseJson.nfseXmlGZipB64) {
    try {
      const buf = Buffer.from(responseJson.nfseXmlGZipB64, 'base64')
      const decompressed = await gunzipBuffer(buf)
      nfseXml = decompressed.toString('utf8')
      console.log('[nfse-emitir] NFS-e XML autorizado decodificado, tamanho:', nfseXml.length)
    } catch (e) {
      console.error('[nfse-emitir] erro ao decodificar nfseXmlGZipB64:', e.message)
    }
  }

  // Extrai número da NFS-e do XML autorizado
  const numeroNfse = extractXmlTag(nfseXml, 'nNFSe') || extractXmlTag(nfseXml, 'nNfse') || ''

  // ── 9. Grava emissão bem-sucedida ─────────────────────────────
  await gravarEmissao(SUPABASE_URL, SERVICE_KEY, {
    user_id: userId, cobranca_id: cobId,
    numero_dps: novNumero, numero_nfse: numeroNfse,
    chave_acesso: chaveAcesso, competencia: cobData.mesRef,
    valor_servico: cobData.totalValue,
    status: 'emitida', xml_nfse: nfseXml || responseBody,
  })

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      numeroDps:   novNumero,
      numeroNfse,
      chaveAcesso,
      idDps,
      xml:         nfseXml,
    }),
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function digits(v = '') { return v.replace(/\D/g, '') }

function validarCpf(cpf) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i)
  let r = (s * 10) % 11; if (r === 10 || r === 11) r = 0
  if (r !== parseInt(cpf[9])) return false
  s = 0
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i)
  r = (s * 10) % 11; if (r === 10 || r === 11) r = 0
  return r === parseInt(cpf[10])
}

function validarCnpj(cnpj) {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  const calc = (n) => {
    let s = 0, p = n - 7
    for (let i = 0; i < n; i++) { s += parseInt(cnpj[i]) * p--; if (p < 2) p = 9 }
    const r = s % 11; return r < 2 ? 0 : 11 - r
  }
  return calc(12) === parseInt(cnpj[12]) && calc(13) === parseInt(cnpj[13])
}

function escXml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function supabaseFetch(url, key, path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'PATCH' ? 'return=minimal' : 'return=representation',
    },
  }
  if (body) opts.body = JSON.stringify(body)
  return fetch(`${url}/rest/v1/${path}`, opts)
}

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
  const key      = Buffer.from(keyHex, 'hex')
  const ivHex    = encHex.slice(0, 32)
  const ctHex    = encHex.slice(32)
  const iv       = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv)
  return decipher.update(ctHex, 'hex', 'utf8') + decipher.final('utf8')
}

function extractFromPfx(pfx) {
  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []
  const keyBags  = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []
  if (!certBags.length) throw new Error('Nenhum certificado encontrado no .pfx')
  if (!keyBags.length)  throw new Error('Chave privada não encontrada no .pfx')
  if (!keyBags[0].key)  throw new Error('Senha do certificado incorreta — acesse Configurações → NFS-e, atualize a senha e salve novamente')
  return {
    privateKey: keyBags[0].key,
    certPem:    forge.pki.certificateToPem(certBags[0].cert),
    certForge:  certBags[0].cert,
  }
}

function parsePfx(pfxBuffer, password) {
  // v4 — monkey-patch cobre todos os fromDer internos do forge (pkcs12 faz ~24 chamadas internas)
  console.log('[nfse-emitir] parsePfx v4 | pfxBuffer.length:', pfxBuffer.length, '| senha.length:', password.length)

  const origFromDer = forge.asn1.fromDer
  let patchCallCount = 0
  forge.asn1.fromDer = function (bytes, opts) {
    patchCallCount++
    // forge 1.4.0: boolean false → {strict:false, parseAllBytes:true} — ainda falha!
    // Precisamos forçar parseAllBytes:false explicitamente em todos os casos
    if (opts === undefined || opts === true || opts === false) {
      opts = { strict: false, parseAllBytes: false }
    } else if (typeof opts === 'object' && opts !== null) {
      opts = { ...opts, parseAllBytes: false }
    }
    return origFromDer.call(this, bytes, opts)
  }

  try {
    const pfxDer = forge.util.createBuffer(pfxBuffer.toString('binary'))
    const pfxAsn = forge.asn1.fromDer(pfxDer)
    console.log('[nfse-emitir] parsePfx: fromDer externo OK, elements:', pfxAsn.value.length)

    // Tentativa 1: MAC SHA-1
    try {
      const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn, true, password)
      console.log('[nfse-emitir] parsePfx: SHA-1 MAC OK | fromDer calls:', patchCallCount)
      return extractFromPfx(pfx)
    } catch (e) {
      console.log('[nfse-emitir] parsePfx: tentativa 1 falhou:', e.message)
      if (!e.message?.includes('MAC could not be verified')) throw e
    }

    // Tentativa 2: SHA-256 MAC bypass
    console.log('[nfse-emitir] parsePfx: SHA-256 detectado, removendo macData...')
    if (pfxAsn.value.length > 2) pfxAsn.value.splice(2)

    const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn, true, password)
    console.log('[nfse-emitir] parsePfx: SHA-256 bypass OK | fromDer calls:', patchCallCount)
    return extractFromPfx(pfx)

  } catch (e2) {
    console.error('[nfse-emitir] parsePfx ERRO FINAL | fromDer calls até agora:', patchCallCount, '| msg:', e2.message)
    console.error('[nfse-emitir] parsePfx stack:', e2.stack?.split('\n').slice(0, 4).join(' | '))
    throw new Error(`Certificado .pfx inválido ou senha incorreta. Detalhe: ${e2.message}`)
  } finally {
    forge.asn1.fromDer = origFromDer
  }
}

// ── Monta a DPS XML (sem assinatura) ─────────────────────────────
// Conforme leiaute v1.01 SPED/SEFIN Nacional
// Referência: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica
function buildDpsXml(cfg, cob, homologacao) {
  const tpAmb = homologacao ? '2' : '1'
  const now = new Date()

  // Data/hora no fuso de Brasília (UTC-3), com margem de 5s contra clock drift
  const brt = new Date(now.getTime() - 5000 - 3 * 3600 * 1000)
  const dhEmi = brt.toISOString().replace(/\.\d+Z$/, '-03:00')

  // Tipo de inscrição: 1=CPF, 2=CNPJ (DIFERENTE da NF-e!)
  const cnpjDigits = digits(cfg.cnpj)
  const tipoInsc   = cnpjDigits.length === 14 ? '2' : '1'
  const insc14     = cnpjDigits.padStart(14, '0')
  const ibge7      = String(cfg.municipioIbge).slice(0, 7)

  // Série: 5 dígitos numéricos (o Id do DPS exige DPS[0-9]{42})
  const serie5     = String(cfg.serie || '00001').slice(0, 5).padStart(5, '0')

  // nDPS: padrão XSD [1-9]{1}[0-9]{0,14} → começa com 1, nunca com zero
  // Usamos '1' + numero padded para 15 dígitos totais
  // O valor no Id (posição) e no elemento <nDPS> são IGUAIS
  const nDpsStr    = '1' + String(cfg.numero).padStart(14, '0')

  // Id do DPS: DPS + ibge7(7) + tipoInsc(1) + cnpj(14) + serie(5) + nDPS(15) = 45 chars
  const id = `DPS${ibge7}${tipoInsc}${insc14}${serie5}${nDpsStr}`

  const dCompet = (cob.mesRef || now.toISOString().slice(0, 7)) // YYYY-MM

  // Tomador: CPF (11 dígitos) ou CNPJ (14 dígitos) com validação dos dígitos verificadores
  const cpfTomador = digits(cob.cpf || '')
  let tomadorTag
  if (cpfTomador.length === 14) {
    if (!validarCnpj(cpfTomador)) {
      throw new Error(`CNPJ do tomador "${cob.tenant}" inválido (${cpfTomador}). Corrija o cadastro do inquilino/cliente antes de emitir a NFS-e.`)
    }
    tomadorTag = `<CNPJ>${cpfTomador}</CNPJ>`
  } else if (cpfTomador.length === 11) {
    if (!validarCpf(cpfTomador)) {
      throw new Error(`CPF do tomador "${cob.tenant}" inválido (${cpfTomador}). Corrija o cadastro do inquilino/cliente antes de emitir a NFS-e.`)
    }
    tomadorTag = `<CPF>${cpfTomador}</CPF>`
  } else if (cpfTomador.length > 0) {
    // Número de dígitos inesperado — usa cNaoNIF para não bloquear (código 0 = sem NIF nacional)
    console.warn('[nfse-emitir] CPF/CNPJ do tomador com comprimento inesperado:', cpfTomador.length, '— usando cNaoNIF')
    tomadorTag = `<cNaoNIF>0</cNaoNIF>`
  } else {
    // Sem CPF/CNPJ
    tomadorTag = `<cNaoNIF>0</cNaoNIF>`
  }

  // Discriminação do serviço
  const discrim = [
    `Administracao imobiliaria ref. ${dCompet}`,
    cob.property             ? `Imovel: ${cob.property}`                                          : '',
    cob.value > 0            ? `Valor: R$ ${Number(cob.value).toFixed(2)}`                        : '',
    cob.seguroFinanceiro > 0 ? `Seguro Financeiro: R$ ${Number(cob.seguroFinanceiro).toFixed(2)}` : '',
    cob.seguroIncendio > 0   ? `Seguro Incendio: R$ ${Number(cob.seguroIncendio).toFixed(2)}`     : '',
    cob.iptu > 0             ? `IPTU: R$ ${Number(cob.iptu).toFixed(2)}`                          : '',
    `Total: R$ ${Number(cob.totalValue).toFixed(2)}`,
  ].filter(Boolean).join(' | ')

  // vServ: DEVE ser string com 2 casas decimais (XSD TSDec15V2)
  const vServ = Number(cob.totalValue).toFixed(2)

  // regTrib: varia conforme regime tributário
  // opSimpNac: 1=não ME/EPP, 2=ME/EPP sem ISSQN, 3=ME/EPP com ISSQN, 4=MEI, 5=ME/EPP imune/isento
  const isSimples = cfg.regime === 'simples' || cfg.regime === 'mei'
  const isMei     = cfg.regime === 'mei'

  let regTribXml
  if (isMei) {
    regTribXml =
      `<regTrib>\n` +
      `<opSimpNac>4</opSimpNac>\n` +
      `<regApTribSN>1</regApTribSN>\n` +
      `<regEspTrib>0</regEspTrib>\n` +
      `</regTrib>`
  } else if (isSimples) {
    regTribXml =
      `<regTrib>\n` +
      `<opSimpNac>3</opSimpNac>\n` +
      `<regApTribSN>1</regApTribSN>\n` +
      `<regEspTrib>0</regEspTrib>\n` +
      `</regTrib>`
  } else {
    regTribXml =
      `<regTrib>\n` +
      `<opSimpNac>1</opSimpNac>\n` +
      `<regEspTrib>0</regEspTrib>\n` +
      `</regTrib>`
  }

  // totTrib: Simples Nacional usa pTotTribSN; outros usam indTotTrib
  // ME/EPP NÃO pode usar indTotTrib (erro E0712)
  let totTribXml
  if (isSimples) {
    totTribXml = `<totTrib><pTotTribSN>${cfg.aliquota}</pTotTribSN></totTrib>`
  } else {
    // indTotTrib: 0=estimativa terceiros, 1=ibpt, 2=não informado
    totTribXml = `<totTrib><indTotTrib>2</indTotTrib></totTrib>`
  }

  // Endereço do prestador é opcional no XSD — omitido para evitar erros de sequência.
  // A localização já está coberta por <cLocEmi> e <cLocPrestacao>.
  const endPrestXml = ''

  // Nome do tomador (obrigatório no elemento <toma>)
  const xNomeToma = escXml((cob.tenant || 'Tomador').slice(0, 150))

  const ns = 'http://www.sped.fazenda.gov.br/nfse'

  // ATENÇÃO: ordem dos elementos é xs:sequence — NÃO alterar a ordem!
  // infDPS NÃO tem atributo versao (só DPS tem)
  return `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="${ns}" versao="1.00">
<infDPS Id="${id}">
<tpAmb>${tpAmb}</tpAmb>
<dhEmi>${dhEmi}</dhEmi>
<verAplic>NOTAFACIL-1.0</verAplic>
<serie>${serie5}</serie>
<nDPS>${nDpsStr}</nDPS>
<dCompet>${dCompet}</dCompet>
<tpEmit>1</tpEmit>
<cLocEmi>${ibge7}</cLocEmi>
<prest>
${tipoInsc === '2' ? `<CNPJ>${cnpjDigits}</CNPJ>` : `<CPF>${cnpjDigits.slice(-11)}</CPF>`}
<IM>${escXml(cfg.inscMun)}</IM>
<xNome>${escXml(cfg.razaoSocial.slice(0, 150))}</xNome>
${endPrestXml}${regTribXml}
</prest>
<toma>
${tomadorTag}
<xNome>${xNomeToma}</xNome>
</toma>
<serv>
<locPrest>
<cLocPrestacao>${ibge7}</cLocPrestacao>
</locPrest>
<cServ>
<cTribNac>${cfg.cTribNac}</cTribNac>
${cfg.cTribMun ? `<cTribMun>${cfg.cTribMun}</cTribMun>\n` : ''}<xDescServ>${escXml('Administracao e intermediacao de imoveis')}</xDescServ>
</cServ>
<infoCompl>
<xInfComp>${escXml(discrim.slice(0, 2000))}</xInfComp>
</infoCompl>
</serv>
<valores>
<vServPrest>
<vServ>${vServ}</vServ>
</vServPrest>
<trib>
<tribMun>
<tribISSQN>1</tribISSQN>
<tpRetISSQN>1</tpRetISSQN>
<pAliq>${cfg.aliquota}</pAliq>
</tribMun>
${totTribXml}
</trib>
</valores>
</infDPS>
</DPS>`
}

// ── XMLDSig RSA-SHA256 com xml-crypto (C14N correto) ─────────────
// A assinatura é IRMÃ de infDPS (não filha), usando action:"after"
// SEFIN Nacional (2024+) usa SHA-256; xml-crypto v6 não gera KeyInfo por
// padrão, então injetamos o X509Certificate após </SignatureValue>
function signDps(xmlStr, privateKey, certForge) {
  const idMatch = xmlStr.match(/infDPS[^>]*Id="([^"]+)"/)
  if (!idMatch) throw new Error('Id do infDPS não encontrado no XML')
  const refId = idMatch[1]

  // Certificado em DER base64 para o KeyInfo
  const certDer = forge.util.encode64(
    forge.asn1.toDer(forge.pki.certificateToAsn1(certForge)).getBytes()
  )
  const keyPem = forge.pki.privateKeyToPem(privateKey)

  const sig = new xmlCrypto.SignedXml({
    privateKey:                keyPem,
    signatureAlgorithm:        'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  })

  sig.addReference({
    xpath:           `//*[@Id='${refId}']`,
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
  })

  sig.computeSignature(xmlStr, {
    location: { reference: `//*[@Id='${refId}']`, action: 'after' },
  })

  let signed = sig.getSignedXml()

  // xml-crypto v6 NÃO gera KeyInfo por padrão — inserimos após </SignatureValue>
  // (KeyInfo fica dentro de <Signature>, após SignatureValue, antes de </Signature>)
  const keyInfoXml =
    `<KeyInfo><X509Data><X509Certificate>${certDer}</X509Certificate></X509Data></KeyInfo>`
  signed = signed.replace('</SignatureValue>', '</SignatureValue>' + keyInfoXml)

  return signed
}

// ── POST com mTLS: GZip + Base64 + JSON ──────────────────────────
// Formato correto: { dpsXmlGZipB64: "<base64>" } com Content-Type: application/json
// Sucesso: HTTP 201 com JSON { chaveAcesso, idDps, nfseXmlGZipB64, alertas }
async function postWithMtls(url, xmlBody, certPem, keyPem) {
  const gz = await gzipBuffer(Buffer.from(xmlBody, 'utf8'))
  const dpsXmlGZipB64 = gz.toString('base64')
  const jsonBody = JSON.stringify({ dpsXmlGZipB64 })
  console.log('[nfse-emitir] XML GZip+Base64 pronto, jsonBody.length:', jsonBody.length)

  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const bodyBuf = Buffer.from(jsonBody, 'utf8')
    const options = {
      hostname:           parsed.hostname,
      port:               parsed.port || 443,
      path:               parsed.pathname + parsed.search,
      method:             'POST',
      cert:               certPem,
      key:                keyPem,
      rejectUnauthorized: true,
      headers: {
        'Content-Type':   'application/json',
        'Accept':         'application/json',
        'Content-Length': bodyBuf.length,
      },
    }
    const req = https.request(options, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        console.log('[nfse-emitir] SEFIN response headers:', JSON.stringify(res.headers))
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })
      })
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout na chamada ao SEFIN')) })
    req.write(bodyBuf)
    req.end()
  })
}

async function gravarEmissao(supabaseUrl, serviceKey, row) {
  try {
    await supabaseFetch(supabaseUrl, serviceKey, 'nfse_emissoes', 'POST', row)
  } catch (e) {
    console.error('[nfse-emitir] erro ao gravar emissão:', e?.message)
  }
}

function extractXmlTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`))
  return m ? m[1].trim() : null
}
