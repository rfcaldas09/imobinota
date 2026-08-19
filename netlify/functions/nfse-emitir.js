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
const { buildNfsePdf, extrairCamposPdf } = require('./nfse-pdf-lib')

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
  //             seguroFinanceiro, seguroIncendio, iptu, codServicoLc116 }

  if (!userId || !cobData) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId e cobData são obrigatórios' }) }
  }
  // cobId pode ser null para emissões avulsas (sem cobrança vinculada)

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }

  // ── 1. Carrega configuração NFS-e do perfil ─────────────────────
  console.log('[nfse-emitir] carregando perfil userId:', userId)
  const profRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}&select=company_name,cnpj,inscricao_municipal,` +
    `nfse_municipio_ibge,nfse_municipio_nome,nfse_codigo_servico,nfse_desc_servico,nfse_serie,` +
    `nfse_ultimo_numero,nfse_cert_path,nfse_cert_password_enc,` +
    `nfse_logradouro,nfse_numero_end,nfse_bairro,nfse_cep,` +
    `regime_tributario,aliquota_iss,` +
    `email_provider,from_name,reply_to,email_subject,email_body,` +
    `smtp_host,smtp_port,smtp_user,smtp_pass,smtp_encryption,from_email`
  )
  if (!profRes.ok) throw new Error(`Erro ao buscar perfil: ${profRes.status}`)
  const profiles = await profRes.json()
  const p = profiles[0]
  if (!p) return { statusCode: 404, body: JSON.stringify({ error: 'Perfil não encontrado' }) }

  // Validações de config
  if (!p.cnpj) return { statusCode: 400, body: JSON.stringify({ error: 'CNPJ/CPF do prestador não configurado em Configurações → Empresa' }) }
  // inscricao_municipal é opcional: alguns municípios não têm dados complementares no CNC NFS-e
  // (erro E0120 quando o campo IM é enviado para esses municípios). O XML já o omite quando vazio.
  if (!p.nfse_municipio_ibge) return { statusCode: 400, body: JSON.stringify({ error: 'Código IBGE do município não configurado em Configurações → Fiscal' }) }

  // Certificado: per-contrato (modo contabilidade) tem precedência sobre certificado do perfil
  const useContratoCert = !!(cobData.certPfxPath)
  const effectiveCertPath    = useContratoCert ? cobData.certPfxPath    : p.nfse_cert_path
  const effectiveCertPassEnc = useContratoCert ? cobData.certSenhaEnc   : p.nfse_cert_password_enc
  if (!effectiveCertPath) {
    return { statusCode: 400, body: JSON.stringify({ error: useContratoCert
      ? 'Certificado digital A1 do proprietário não encontrado. Faça upload em Contratos → Editar Contrato.'
      : 'Certificado digital A1 não enviado em Configurações → Empresa' }) }
  }

  // Simples Nacional/MEI: alíquota ISS só é exigida quando ISS é retido pelo tomador (tpRetISSQN=2)
  // Para tpRetISSQN=1, pAliq não deve ser enviado (E0625), então a alíquota é opcional
  const _isSimplesPrestador = ['simples', 'mei'].includes((p.regime_tributario || '').toLowerCase())
  if (!_isSimplesPrestador && !p.aliquota_iss) return { statusCode: 400, body: JSON.stringify({ error: 'Alíquota ISS não configurada em Configurações → Fiscal' }) }

  // ── 2. Incrementa número da DPS ───────────────────────────────
  const novNumero = (p.nfse_ultimo_numero || 0) + 1
  const updRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}`,
    'PATCH', { nfse_ultimo_numero: novNumero }
  )
  if (!updRes.ok) throw new Error('Erro ao incrementar número DPS')
  console.log('[nfse-emitir] numeroDPS:', novNumero)

  // ── 3. Baixa o certificado do Storage ──────────────────────────
  console.log('[nfse-emitir] cert source:', useContratoCert ? 'contrato' : 'perfil', '| path:', effectiveCertPath)
  const certBytes = await downloadCert(SUPABASE_URL, SERVICE_KEY, effectiveCertPath)
  console.log('[nfse-emitir] cert baixado, tamanho bytes:', certBytes.length)

  if (!effectiveCertPassEnc) {
    return { statusCode: 400, body: JSON.stringify({ error: useContratoCert
      ? 'Senha do certificado do proprietário não encontrada. Edite o contrato e informe a senha.'
      : 'Senha do certificado não encontrada. Acesse Configurações → NFS-e, informe a senha e salve.' }) }
  }
  if (!CERT_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'NFSE_CERT_KEY não configurada nas variáveis de ambiente do servidor.' }) }
  }

  const certPassword = decryptPassword(effectiveCertPassEnc, CERT_KEY)
  if (!certPassword) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Falha ao descriptografar a senha do certificado. Verifique se NFSE_CERT_KEY no servidor é a mesma usada no upload.' }) }
  }
  console.log('[nfse-emitir] certPassword decriptada OK, tamanho:', certPassword.length)

  // ── 4. Extrai chave privada e certificado do .pfx ──────────────
  const { privateKey, certPem, certForge } = parsePfx(certBytes, certPassword)

  // Log: CNPJ do certificado vs CNPJ do perfil (para diagnosticar E0718)
  const certSubject = certForge.subject.attributes.map(a => `${a.shortName}=${a.value}`).join(', ')
  const certIssuer  = certForge.issuer.attributes.map(a => `${a.shortName}=${a.value}`).join(', ')
  const certSerial  = certForge.serialNumber
  const certValidTo = certForge.validity.notAfter
  // O CNPJ do e-CNPJ fica no CN ou no campo OID 2.16.76.1.3.3 (serialNumber BR)
  const certCnAttr  = certForge.subject.getField('CN')?.value || ''
  const certSerial2 = certForge.subject.getField('serialNumber')?.value || ''
  console.log('[nfse-emitir] CERT subject:', certSubject)
  console.log('[nfse-emitir] CERT issuer:', certIssuer)
  console.log('[nfse-emitir] CERT serialNumber (hex):', certSerial)
  console.log('[nfse-emitir] CERT CN:', certCnAttr)
  console.log('[nfse-emitir] CERT subject serialNumber:', certSerial2)
  console.log('[nfse-emitir] CERT válido até:', certValidTo)
  console.log('[nfse-emitir] CNPJ do perfil (digits):', digits(p.cnpj))

  // ── 5. Monta XML da DPS ────────────────────────────────────────
  // Série: deve ser numérica (5 dígitos) para o Id do DPS ser válido (padrão DPS[0-9]{42})
  // Se o usuário configurou série alfanumérica (ex: "NFSE"), replace(/\D/g,'') resulta em ''
  // que padStart(5,'0') transforma em '00000' (truthy!) — por isso trocamos all-zeros por '00001'
  const serieRaw = (() => {
    const s = (p.nfse_serie || '').replace(/\D/g, '').slice(0, 5).padStart(5, '0')
    return /^0+$/.test(s) ? '00001' : s
  })()

  // ── Converte código LC 116 (ex: '10.09') para cTribNac de 6 dígitos (ex: '100901') ──
  // Formato SEFIN: 2 dígitos (item) + 2 dígitos (subitem) + 2 dígitos (variação = '01')
  function lc116ToCTribNac(cod) {
    if (!cod) return null
    const [major, minor] = cod.split('.')
    if (!major) return null
    return major.padStart(2, '0') + (minor || '01').padStart(2, '0') + '01'
  }

  // Prioridade do cTribNac:
  // 1. Código do contrato (cobData.codServicoLc116) — para serviços que variam por contrato
  // 2. Código padrão do perfil (nfse_codigo_servico, se for formato LC116 com ponto)
  // 3. Fallback: 100901 (Administração de bens e negócios — LC 116 item 10.09)
  const cTribNacFromContract = cobData.codServicoLc116 ? lc116ToCTribNac(cobData.codServicoLc116) : null
  const cTribNacFromProfile  = (p.nfse_codigo_servico || '').includes('.')
    ? lc116ToCTribNac(p.nfse_codigo_servico.trim())
    : null
  const cTribNacResolved = cTribNacFromContract || cTribNacFromProfile || '100901'
  console.log('[nfse-emitir] cTribNac:', cTribNacResolved,
    '| fonte:', cTribNacFromContract ? 'contrato' : cTribNacFromProfile ? 'perfil' : 'default')

  // Município emissor: per-nota sobrepõe perfil (prestador pode emitir de municípios diferentes)
  const municipioIbgeResolved = (cobData.prestMunicipioIbge && String(cobData.prestMunicipioIbge).trim())
    ? String(cobData.prestMunicipioIbge).trim()
    : p.nfse_municipio_ibge

  // IM do prestador: per-nota sobrepõe perfil.
  //   null/undefined em cobData → usa perfil (backward compat com notas antigas reprocessadas)
  //   string vazia em cobData → IM omitida (município não aceita IM: E0120)
  //   string não-vazia em cobData → IM enviada (município exige IM: E0116 se ausente)
  const inscMunResolved = (cobData.prestInscricaoMunicipal !== undefined && cobData.prestInscricaoMunicipal !== null)
    ? (cobData.prestInscricaoMunicipal || null)
    : (p.inscricao_municipal || null)

  const config = {
    cnpj:          digits(p.cnpj),
    inscMun:       inscMunResolved,
    razaoSocial:   p.company_name || 'Prestador',
    municipioIbge: municipioIbgeResolved,
    serie:         serieRaw,
    numero:        novNumero,
    // cTribNac: código de tributação nacional (6 dígitos) — resolvido por prioridade acima
    cTribNac:      cTribNacResolved,
    // cTribMun: código de serviço municipal (conforme tabela da prefeitura, opcional no XSD)
    // Só inclui se o usuário configurou um código puramente numérico em Configurações → Fiscal
    cTribMun:      /^\d+$/.test((p.nfse_codigo_servico || '').trim()) ? p.nfse_codigo_servico.trim() : null,
    aliquota:      parseFloat((p.aliquota_iss || '2').toString().replace(',', '.')).toFixed(2),
    logradouro:    p.nfse_logradouro || 'Endereço não informado',
    numeroEnd:     p.nfse_numero_end || 's/n',
    bairro:        p.nfse_bairro || '',
    cep:           digits(p.nfse_cep || '').slice(0, 8),
    // regime: 'simples' | 'lucro_presumido' | outros
    regime:        (p.regime_tributario || 'simples'),
    // descServico: texto configurável pelo usuário em Configurações → Fiscal
    descServico:   p.nfse_desc_servico || '',
    // Locação imobiliária (modo contabilidade): NBS e dados do imóvel
    codNbs:        cobData.codNbs || null,
    imovel:        cobData.imovel || null,
    // imovel = { cib, inscricaoFiscal, logradouro, numero, complemento, bairro, cep, codMun, munNome }
  }

  let dpsXml
  try {
    dpsXml = buildDpsXml(config, cobData, homologacao)
  } catch (validErr) {
    // Erros de validação de dados (CPF/CNPJ inválido etc.) → 400 com mensagem amigável
    return { statusCode: 400, body: JSON.stringify({ error: validErr.message }) }
  }
  console.log('[nfse-emitir] DPS gerada, assinando...')
  console.log('[nfse-emitir] DPS XML COMPLETO:\n', dpsXml)

  // ── 6. Assina o XML ─────────────────────────────────────────────
  const dpsAssinada = signDps(dpsXml, privateKey, certForge)
  console.log('[nfse-emitir] DPS assinada, tamanho:', dpsAssinada.length)

  // ── 7. Envia para o SEFIN (GZip + Base64 + JSON com mTLS) ──────
  const sefinUrl = homologacao ? SEFIN_URL_TEST : SEFIN_URL_PROD
  console.log('[nfse-emitir] enviando para SEFIN:', sefinUrl, '| homologacao:', homologacao)

  // Função auxiliar: verifica se o corpo de resposta contém um código de erro específico
  const hasErrCode = (body, code) => {
    try {
      const j = JSON.parse(body)
      return (j.erros || []).some(e => (e.Codigo || e.codigo || '').includes(code))
    } catch { return false }
  }

  let { status: httpStatus, body: responseBody } = await postWithMtls(
    sefinUrl, dpsAssinada, certPem, forge.pki.privateKeyToPem(privateKey)
  )
  console.log('[nfse-emitir] SEFIN status:', httpStatus, '| body COMPLETO:', responseBody)

  // ── Retry automático para erros de IM ───────────────────────────
  // E0120: IM enviada mas o município não tem dados no CNC → reprocessa SEM IM
  // E0116: IM exigida mas não enviada → reprocessa COM IM (do perfil)
  if (httpStatus !== 201 && hasErrCode(responseBody, 'E0120') && config.inscMun) {
    console.log('[nfse-emitir] E0120 detectado — município não aceita IM. Reprocessando sem IM...')
    config.inscMun = null
    const dpsRetry   = buildDpsXml(config, cobData, homologacao)
    const signRetry  = signDps(dpsRetry, privateKey, certForge)
    const retryRes   = await postWithMtls(sefinUrl, signRetry, certPem, forge.pki.privateKeyToPem(privateKey))
    console.log('[nfse-emitir] retry sem IM — status:', retryRes.status, '| body:', retryRes.body)
    httpStatus   = retryRes.status
    responseBody = retryRes.body
  } else if (httpStatus !== 201 && hasErrCode(responseBody, 'E0116') && !config.inscMun && p.inscricao_municipal) {
    console.log('[nfse-emitir] E0116 detectado — município exige IM. Reprocessando com IM do perfil...')
    config.inscMun = p.inscricao_municipal
    const dpsRetry   = buildDpsXml(config, cobData, homologacao)
    const signRetry  = signDps(dpsRetry, privateKey, certForge)
    const retryRes   = await postWithMtls(sefinUrl, signRetry, certPem, forge.pki.privateKeyToPem(privateKey))
    console.log('[nfse-emitir] retry com IM — status:', retryRes.status, '| body:', retryRes.body)
    httpStatus   = retryRes.status
    responseBody = retryRes.body
  }

  // SEFIN retorna 201 para sucesso
  if (httpStatus !== 201) {
    // Extrai mensagem legível dos erros do SEFIN (formato JSON { erros: [{Codigo, Descricao, Complemento}] })
    let userMessage = `Erro na comunicação com o SEFIN (HTTP ${httpStatus})`

    // 503 = SEFIN aplicou rate limiting (rejeita requisições em sequência rápida)
    if (httpStatus === 503 || responseBody.includes('Service Unavailable')) {
      userMessage = 'A SEFIN rejeitou a requisição por excesso de envios em sequência (503). Tente emitir esta nota novamente individualmente.'
    } else {
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
    }

    await gravarEmissao(SUPABASE_URL, SERVICE_KEY, {
      user_id: userId, cobranca_id: cobId || null,
      numero_dps: novNumero, competencia: cobData.mesRef,
      valor_servico: cobData.totalValue,
      tomador_nome: cobData.tenant || null,
      status: 'erro', erro_msg: userMessage,
      cob_data_json: cobData,  // salva para permitir reprocessamento
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
  const emissaoId = await gravarEmissao(SUPABASE_URL, SERVICE_KEY, {
    user_id: userId, cobranca_id: cobId || null,
    numero_dps: novNumero, numero_nfse: numeroNfse,
    chave_acesso: chaveAcesso, competencia: cobData.mesRef,
    valor_servico: cobData.totalValue,
    tomador_nome: cobData.tenant || null,
    status: 'emitida', xml_nfse: nfseXml || responseBody,
    discriminacao_servico: cobData.discriminacao || null,
    cob_data_json: cobData,
  })

  // ── 10. Envia e-mail com PDF da NFS-e ─────────────────────────
  try {
    await enviarEmailNfse({
      profile: p,
      cobData,
      numeroNfse,
      nfseXml: nfseXml || responseBody,
      homologacao,
    })
    console.log('[nfse-emitir] e-mail NFS-e enviado com sucesso')
  } catch (emailErr) {
    // Não quebra a emissão por falha de e-mail — apenas loga
    console.error('[nfse-emitir] falha ao enviar e-mail NFS-e:', emailErr.message)
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      numeroDps:   novNumero,
      numeroNfse,
      chaveAcesso,
      idDps,
      xml:         nfseXml,
      emissaoId,
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

  // TSData exige YYYY-MM-DD — usa o primeiro dia do mês de competência
  // Garante formato YYYY-MM (trunca se vier YYYY-MM-DD) antes de adicionar o dia
  const dCompet = (cob.mesRef || now.toISOString().slice(0, 7)).slice(0, 7) + '-01'

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
    // Número de dígitos inesperado — trata como sem NIF (código 3 = Outros)
    console.warn('[nfse-emitir] CPF/CNPJ do tomador com comprimento inesperado:', cpfTomador.length, '— usando cNaoNIF=3')
    tomadorTag = `<cNaoNIF>3</cNaoNIF>`
  } else {
    // Sem CPF/CNPJ — código 1 = pessoa natural não obrigada à inscrição no CPF
    tomadorTag = `<cNaoNIF>1</cNaoNIF>`
  }

  // Discriminação do serviço:
  // Usa o texto informado pelo usuário (fixo no contrato ou capturado mensalmente).
  // Se não informado, não envia nada — o campo xInfComp fica omitido.
  // TSDescInfCompl não permite \n ou \r (Pattern constraint) — substitui quebras de linha por espaço.
  const discrim = cob.discriminacao
    ? String(cob.discriminacao).replace(/[\r\n]+/g, ' ').trim()
    : ''

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

  // Retenções: tpRetISSQN e tributos federais retidos na fonte
  const ret = cob.retencoes || {}
  const tpRetISSQN = ret.tpRetISSQN || 1   // 1=não retido, 2=retido pelo tomador

  // Calcula valores retidos (valor = vServ * percentual / 100)
  const vServNum = Number(cob.totalValue) || 0
  const calcV = pct => pct > 0 ? (vServNum * pct / 100).toFixed(2) : null

  // Nomes conforme XSD NFS-e Nacional: tribFed → piscofins | vRetCP | vRetIRRF | vRetCSLL
  // PIS e COFINS entram dentro de <piscofins> com cálculo de base e alíquota.
  // vRetCP = Contribuição Previdenciária (INSS), vRetIRRF = IRRF, vRetCSLL = CSLL.
  const vRetIRRF   = calcV(ret.pIRRF   || 0)
  const vRetCSLL   = calcV(ret.pCSLL   || 0)
  const vRetCOFINS = calcV(ret.pCOFINS || 0)
  const vRetPIS    = calcV(ret.pPIS    || 0)
  const vRetCP     = calcV(ret.pINSS   || 0)

  const hasPisCofins = vRetCOFINS || vRetPIS
  const hasRetFed    = vRetIRRF || vRetCSLL || vRetCOFINS || vRetPIS || vRetCP

  // totTrib:
  //   Simples Nacional (opSimpNac 2,3,4) → pTotTribSN com a alíquota do DAS
  //   Não optante (opSimpNac 1, Lucro Presumido/Real) → indTotTrib=1 + pTotTrib calculado
  //     (E0713 rejeitou indTotTrib=0; E1235 exige tribFed ou totTrib; informar Lei 12.741)
  //   ME/EPP NÃO pode usar indTotTrib (E0712)
  let totTribXml
  if (isSimples) {
    totTribXml = `<totTrib><pTotTribSN>${cfg.aliquota}</pTotTribSN></totTrib>`
  } else {
    // Não-Simples: totTrib → pTotTrib → pTotTribFed (soma das alíquotas federais retidas)
    // Estrutura confirmada pelos erros do SEFIN:
    //   E0713: indTotTrib e pTotTribSN proibidos para não-Simples
    //   E1235 (pTotTrib sem filhos): pTotTrib é complexo, filho = pTotTribFed
    //   E1235 (pTotTribFed filho direto de totTrib): deve ser aninhado em pTotTrib
    // pTotTrib: sequência obrigatória pTotTribFed → pTotTribEst → pTotTribMun
    // revelada pelos erros E1235 do SEFIN um campo por vez
    const _pFed = ((parseFloat(ret.pIRRF)   || 0)
                 + (parseFloat(ret.pCSLL)   || 0)
                 + (parseFloat(ret.pCOFINS) || 0)
                 + (parseFloat(ret.pPIS)    || 0)
                 + (parseFloat(ret.pINSS)   || 0)).toFixed(2)
    const _pEst = '0.00'                          // serviços não têm tributo estadual
    const _pMun = (parseFloat(cfg.aliquota) || 0).toFixed(2) // ISS
    totTribXml = `<totTrib><pTotTrib>` +
      `<pTotTribFed>${_pFed}</pTotTribFed>` +
      `<pTotTribEst>${_pEst}</pTotTribEst>` +
      `<pTotTribMun>${_pMun}</pTotTribMun>` +
      `</pTotTrib></totTrib>`
  }

  // <piscofins>: sequência obrigatória: CST → pAliqPis → pAliqCofins → vPis → vCofins → tpRetPisCofins
  // CST 01 = Operação tributável (alíquota básica); tpRetPisCofins 1 = retido na fonte
  const pAliqPis    = (Number(ret.pPIS)    || 0).toFixed(2)
  const pAliqCofins = (Number(ret.pCOFINS) || 0).toFixed(2)
  const pisCofinsXml = hasPisCofins
    ? `<piscofins>\n` +
      `<CST>01</CST>\n` +
      `<pAliqPis>${pAliqPis}</pAliqPis>\n` +
      `<pAliqCofins>${pAliqCofins}</pAliqCofins>\n` +
      `<vPis>${vRetPIS || '0.00'}</vPis>\n` +
      `<vCofins>${vRetCOFINS || '0.00'}</vCofins>\n` +
      `<tpRetPisCofins>1</tpRetPisCofins>\n` +
      `</piscofins>\n`
    : ''

  // Filhos diretos de <tribFed> (ordem XSD: piscofins, vRetCP, vRetIRRF, vRetCSLL)
  const tribFedInnerXml = pisCofinsXml +
    (vRetCP   ? `<vRetCP>${vRetCP}</vRetCP>\n`       : '') +
    (vRetIRRF ? `<vRetIRRF>${vRetIRRF}</vRetIRRF>\n` : '') +
    (vRetCSLL ? `<vRetCSLL>${vRetCSLL}</vRetCSLL>\n`  : '')

  console.log('[nfse-emitir] tpRetISSQN:', tpRetISSQN, '| retFed:', hasRetFed ? JSON.stringify({ vRetIRRF, vRetCSLL, vRetCOFINS, vRetPIS, vRetCP }) : 'nenhuma')

  // Endereço do prestador é opcional no XSD — omitido para evitar erros de sequência.
  // A localização já está coberta por <cLocEmi> e <cLocPrestacao>.
  const endPrestXml = ''

  // xDescServ: descrição do serviço para o SEFIN (obrigatório, até 150 chars)
  // Prioridade: campo configurável no perfil > fallback genérico
  const xDescServ = (cfg.descServico || '').trim() || 'Prestação de serviços'

  // infoCompl: só inclui o bloco se houver texto de discriminação
  const infoComplXml = discrim
    ? `<infoCompl>\n<xInfComp>${escXml(discrim.slice(0, 2000))}</xInfComp>\n</infoCompl>\n`
    : ''

  // Nome do tomador (obrigatório no elemento <toma>)
  const xNomeToma = escXml((cob.tenant || 'Tomador').slice(0, 150))

  // Endereço do tomador — obrigatório quando tpRetISSQN = 2
  const te = cob.tomadorEnd
  const endTomaXml = te && te.cep && te.codMun
    ? `<end>\n` +
      `<endNac>\n` +
      `<cMun>${digits(te.codMun).slice(0, 7)}</cMun>\n` +
      `<CEP>${digits(te.cep).slice(0, 8)}</CEP>\n` +
      `</endNac>\n` +
      `<xLgr>${escXml((te.logradouro || '').slice(0, 125))}</xLgr>\n` +
      `<nro>${escXml((te.numero || 'S/N').slice(0, 10))}</nro>\n` +
      `<xBairro>${escXml((te.bairro || '').slice(0, 72))}</xBairro>\n` +
      `</end>\n`
    : ''

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
${cfg.inscMun ? `<IM>${cfg.inscMun}</IM>\n` : ''}${endPrestXml}${regTribXml}
</prest>
<toma>
${tomadorTag}
<xNome>${xNomeToma}</xNome>
${endTomaXml}</toma>
<serv>
<locPrest>
<cLocPrestacao>${ibge7}</cLocPrestacao>
</locPrest>
<cServ>
<cTribNac>${cfg.cTribNac}</cTribNac>
${cfg.cTribMun ? `<cTribMun>${cfg.cTribMun}</cTribMun>\n` : ''}<xDescServ>${escXml(xDescServ.slice(0, 150))}</xDescServ>
</cServ>
${cfg.imovel ? `<infObra>\n<BemImovel>\n` +
  (cfg.imovel.cib            ? `<nCib>${escXml(cfg.imovel.cib.toUpperCase())}</nCib>\n`                 : '') +
  (cfg.imovel.inscricaoFiscal? `<nInscImMunic>${escXml(cfg.imovel.inscricaoFiscal)}</nInscImMunic>\n`   : '') +
  (cfg.imovel.codMun && cfg.imovel.cep ? `<end>\n<endNac>\n<cMun>${digits(cfg.imovel.codMun).slice(0,7)}</cMun>\n<CEP>${digits(cfg.imovel.cep).slice(0,8)}</CEP>\n</endNac>\n` +
    (cfg.imovel.logradouro ? `<xLgr>${escXml(String(cfg.imovel.logradouro).slice(0,125))}</xLgr>\n` : '') +
    (cfg.imovel.numero     ? `<nro>${escXml(String(cfg.imovel.numero).slice(0,10))}</nro>\n`         : '<nro>S/N</nro>\n') +
    (cfg.imovel.complemento? `<xCpl>${escXml(String(cfg.imovel.complemento).slice(0,60))}</xCpl>\n`  : '') +
    (cfg.imovel.bairro     ? `<xBairro>${escXml(String(cfg.imovel.bairro).slice(0,72))}</xBairro>\n` : '') +
    `</end>\n`
  : '') +
  `</BemImovel>\n</infObra>\n` : ''}${infoComplXml}
</serv>
<valores>
<vServPrest>
<vServ>${vServ}</vServ>
</vServPrest>
<trib>
<tribMun>
<tribISSQN>1</tribISSQN>
<tpRetISSQN>${tpRetISSQN}</tpRetISSQN>
${tpRetISSQN === 2 ? `<pAliq>${cfg.aliquota}</pAliq>\n` : ''}</tribMun>
${hasRetFed ? `<tribFed>\n${tribFedInnerXml}</tribFed>\n` : ''}${totTribXml}
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
// Retry automático em caso de 503 (rate limiting do SEFIN): até 3 tentativas com backoff de 5s
async function postWithMtls(url, xmlBody, certPem, keyPem) {
  const gz = await gzipBuffer(Buffer.from(xmlBody, 'utf8'))
  const dpsXmlGZipB64 = gz.toString('base64')
  const jsonBody = JSON.stringify({ dpsXmlGZipB64 })
  console.log('[nfse-emitir] XML GZip+Base64 pronto, jsonBody.length:', jsonBody.length)

  const doRequest = () => new Promise((resolve, reject) => {
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

  const MAX_TENTATIVAS = 3
  const BACKOFF_MS     = 5000   // 5s entre tentativas em caso de 503

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const result = await doRequest()
    if (result.status !== 503 && !result.body.includes('Service Unavailable')) {
      return result   // sucesso ou erro definitivo (não 503)
    }
    if (tentativa < MAX_TENTATIVAS) {
      console.warn(`[nfse-emitir] SEFIN retornou 503 (tentativa ${tentativa}/${MAX_TENTATIVAS}) — aguardando ${BACKOFF_MS}ms antes de tentar novamente`)
      await new Promise(r => setTimeout(r, BACKOFF_MS))
    }
  }

  // Esgotou as tentativas — retorna o último 503
  console.error(`[nfse-emitir] SEFIN retornou 503 em todas as ${MAX_TENTATIVAS} tentativas`)
  return { status: 503, body: 'Service Unavailable' }
}

async function gravarEmissao(supabaseUrl, serviceKey, row) {
  try {
    const res = await supabaseFetch(supabaseUrl, serviceKey, 'nfse_emissoes', 'POST', row)
    if (!res.ok) {
      const body = await res.text()
      console.error(`[nfse-emitir] erro ao gravar emissão HTTP ${res.status}:`, body)
      throw new Error(`Falha ao gravar emissão no banco (HTTP ${res.status}): ${body}`)
    }
    const json = await res.json().catch(() => null)
    // Supabase retorna array com o registro inserido quando Prefer: return=representation
    const inserted = Array.isArray(json) ? json[0] : json
    return inserted?.id || null
  } catch (e) {
    console.error('[nfse-emitir] erro ao gravar emissão:', e?.message)
    throw e   // propaga para o caller ver no log e no erro retornado ao frontend
  }
}

function extractXmlTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`))
  return m ? m[1].trim() : null
}



// ── Envia e-mail com PDF da NFS-e anexado ────────────────────────
async function enviarEmailNfse({ profile: p, cobData, numeroNfse, nfseXml, homologacao }) {
  if (!p) return

  // Gera PDF
  const pdfFields = extrairCamposPdf(nfseXml, cobData, p)
  const pdfBuffer = await buildNfsePdf(pdfFields)
  const pdfBase64 = pdfBuffer.toString('base64')
  const pdfFilename = `NFS-e_${numeroNfse || 'rascunho'}_${cobData.mesRef || ''}.pdf`

  // Template do e-mail
  const subject  = p.email_subject || 'NFS-e {{mes}}/{{ano}}'
  const bodyTpl  = p.email_body    || 'Olá, {{cliente}}!\n\nSegue em anexo a nota fiscal de serviço referente à competência {{mes}}/{{ano}}:\n\n💰 Valor total: {{valor}}\n\nEm caso de dúvidas, entre em contato conosco.\n\nAtenciosamente,\n{{empresa}}'
  const fromName = p.from_name || 'NotaFacil'
  const replyTo  = p.reply_to  || ''

  const [ano, mesNum] = String(cobData.mesRef || '').split('-')
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const mesNome = meses[parseInt(mesNum || '1', 10) - 1] || mesNum || ''

  const vars = {
    '{{cliente}}':   cobData.tenant    || '',
    '{{inquilino}}': cobData.tenant    || '',
    '{{mes}}':       mesNome,
    '{{ano}}':       ano               || '',
    '{{imovel}}':    cobData.property  || '',
    '{{valor}}':     'R$ ' + (parseFloat(cobData.totalValue || 0).toFixed(2)).replace('.', ','),
    '{{empresa}}':   p.company_name    || fromName,
    '{{vencimento}}': '',
    '{{link_boleto}}': '',
    '{{nfse_numero}}': numeroNfse      || '',
  }

  const applyVars = tpl => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(k, v), tpl)

  const subjectFinal = applyVars(subject)
  const bodyFinal    = applyVars(bodyTpl)
  const bodyHtml     = bodyFinal.replace(/\n/g, '<br>')
  const bodyText     = bodyFinal

  // Destinatários: homologacao → só reply_to; produção → cliente + cc reply_to
  const toAddr = homologacao ? (replyTo || cobData.email || '') : (cobData.email || '')
  if (!toAddr) {
    console.warn('[nfse-email] sem destinatário, pulando envio de e-mail')
    return
  }

  const provider = p.email_provider || 'resend'

  if (provider === 'resend') {
    const apiKey   = process.env.RESEND_API_KEY
    const fromAddr = process.env.RESEND_FROM_EMAIL
    if (!apiKey || !fromAddr) throw new Error('RESEND_API_KEY ou RESEND_FROM_EMAIL não configurados')

    const payload = {
      from:    `${fromName} <${fromAddr}>`,
      to:      [toAddr],
      subject: subjectFinal,
      html:    `<div style="font-family:sans-serif;max-width:600px">${bodyHtml}</div>`,
      text:    bodyText,
      attachments: [{ filename: pdfFilename, content: pdfBase64 }],
      ...(replyTo && !homologacao ? { reply_to: replyTo } : {}),
      ...(replyTo && !homologacao ? { cc: [replyTo] } : {}),
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`Resend error: ${data.message || res.status}`)

  } else {
    // SMTP via nodemailer
    const nodemailer = require('nodemailer')
    const transporter = nodemailer.createTransport({
      host:   p.smtp_host,
      port:   Number(p.smtp_port) || 587,
      secure: p.smtp_encryption === 'ssl',
      auth:   { user: p.smtp_user, pass: p.smtp_pass },
      ...(p.smtp_encryption === 'none' ? { tls: { rejectUnauthorized: false } } : {}),
    })

    await transporter.sendMail({
      from:        `${fromName} <${p.from_email || p.smtp_user}>`,
      to:          toAddr,
      ...(replyTo && !homologacao ? { replyTo, cc: replyTo } : {}),
      subject:     subjectFinal,
      html:        `<div style="font-family:sans-serif;max-width:600px">${bodyHtml}</div>`,
      text:        bodyText,
      attachments: [{ filename: pdfFilename, content: pdfBuffer }],
    })
  }
}
