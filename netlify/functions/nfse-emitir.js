// Netlify Function — emissão de NFS-e via Sistema Nacional NFS-e (SEFIN)
// Fluxo:
//   1. Baixa o certificado .pfx do Supabase Storage
//   2. Incrementa o número sequencial de DPS no profile do usuário
//   3. Monta o XML da DPS conforme leiaute nacional v1.00
//   4. Assina o XML com XMLDSig RSA-SHA1 (padrão NF-e)
//   5. Faz POST com mTLS na API do SEFIN Nacional
//   6. Grava resultado em nfse_emissoes no Supabase

const https  = require('https')
const forge  = require('node-forge')
const crypto = require('crypto')

// ── URLs do SEFIN Nacional ────────────────────────────────────────
const SEFIN_URL_PROD = 'https://sefin.nfse.gov.br/sefinne/nfse'
const SEFIN_URL_TEST = 'https://adn.producaorestrita.nfse.gov.br/contribuintes/nfse'

// ── Chave de criptografia para senha do cert (variável de ambiente) ─
const CERT_KEY = process.env.NFSE_CERT_KEY // 32-char hex string → 128-bit key

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

  // ── 2. Incrementa número da DPS (atômico via RPC não disponível — usa leitura+escrita) ─
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
    return { statusCode: 400, body: JSON.stringify({ error: 'Senha do certificado não encontrada. Acesse Configurações → Fiscal / NFS-e, re-envie o arquivo .pfx e informe a senha.' }) }
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
  const config = {
    cnpj:            digits(p.cnpj),
    inscMun:         p.inscricao_municipal,
    razaoSocial:     p.company_name || 'Prestador',
    municipioIbge:   p.nfse_municipio_ibge,
    serie:           (p.nfse_serie || 'IMOB').slice(0, 5).padEnd(5),
    numero:          novNumero,
    codigoServico:   (p.nfse_codigo_servico || '6.05').replace('.', '').padStart(4, '0'),
    aliquota:        parseFloat((p.aliquota_iss || '2').toString().replace(',', '.')).toFixed(2),
    logradouro:      p.nfse_logradouro || 'Endereço não informado',
    numeroEnd:       p.nfse_numero_end || 's/n',
    bairro:          p.nfse_bairro || '',
    cep:             digits(p.nfse_cep || '').slice(0, 8),
    regimeTrib:      p.regime_tributario === 'simples' ? 1 : p.regime_tributario === 'real' ? 2 : 3,
  }

  const dpsXml = buildDpsXml(config, cobData, homologacao)
  console.log('[nfse-emitir] DPS gerada, assinando...')

  // ── 6. Assina o XML ─────────────────────────────────────────────
  const dpsAssinada = signDps(dpsXml, privateKey, certForge)
  console.log('[nfse-emitir] DPS assinada, tamanho:', dpsAssinada.length)

  // ── 7. Envia para o SEFIN ──────────────────────────────────────
  const sefinUrl = homologacao ? SEFIN_URL_TEST : SEFIN_URL_PROD
  console.log('[nfse-emitir] enviando para SEFIN:', sefinUrl)

  const { status: httpStatus, body: responseBody } = await postWithMtls(
    sefinUrl, dpsAssinada, certPem, forge.pki.privateKeyToPem(privateKey)
  )
  console.log('[nfse-emitir] SEFIN status:', httpStatus, '| body:', responseBody.slice(0, 300))

  if (httpStatus < 200 || httpStatus > 299) {
    // Grava erro em nfse_emissoes
    await gravarEmissao(SUPABASE_URL, SERVICE_KEY, {
      user_id: userId, cobranca_id: cobId,
      numero_dps: novNumero, competencia: cobData.mesRef,
      valor_servico: cobData.totalValue,
      status: 'erro', erro_msg: `HTTP ${httpStatus}: ${responseBody.slice(0, 500)}`,
    })
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `SEFIN retornou ${httpStatus}`, detail: responseBody.slice(0, 800) }),
    }
  }

  // Extrai número da NFS-e e chave de acesso do XML de retorno
  const numeroNfse   = extractXmlTag(responseBody, 'nNFSe')   || extractXmlTag(responseBody, 'numero')
  const chaveAcesso  = extractXmlTag(responseBody, 'chNFSe')  || extractXmlTag(responseBody, 'chaveAcesso')

  // ── 8. Grava emissão bem-sucedida ─────────────────────────────
  await gravarEmissao(SUPABASE_URL, SERVICE_KEY, {
    user_id: userId, cobranca_id: cobId,
    numero_dps: novNumero, numero_nfse: numeroNfse,
    chave_acesso: chaveAcesso, competencia: cobData.mesRef,
    valor_servico: cobData.totalValue,
    status: 'emitida', xml_nfse: responseBody,
  })

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      numeroDps:   novNumero,
      numeroNfse,
      chaveAcesso,
      xml:         responseBody,
    }),
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function digits(v = '') { return v.replace(/\D/g, '') }

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
  if (!certBags.length || !keyBags.length) throw new Error('Certificado .pfx inválido ou corrompido')
  return {
    privateKey: keyBags[0].key,
    certPem:    forge.pki.certificateToPem(certBags[0].cert),
    certForge:  certBags[0].cert,
  }
}

function parsePfx(pfxBuffer, password) {
  // v4 — monkey-patch cobre todos os fromDer internos do forge (pkcs12 faz 24 chamadas internas)
  console.log('[nfse-emitir] parsePfx v4 | pfxBuffer.length:', pfxBuffer.length, '| senha.length:', password.length)

  const origFromDer = forge.asn1.fromDer
  let patchCallCount = 0
  forge.asn1.fromDer = function (bytes, opts) {
    patchCallCount++
    if (opts === undefined || opts === true) opts = false
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
function buildDpsXml(cfg, cob, homologacao) {
  const tpAmb  = homologacao ? '2' : '1'
  const now    = new Date()
  const dhEmi  = now.toISOString().replace(/\.\d+Z$/, '-03:00')

  // Tipo de inscrição: 2=CNPJ, 1=CPF
  const cnpjDigits = digits(cfg.cnpj)
  const tipoInsc   = cnpjDigits.length === 14 ? '2' : '1'
  const insc14     = cnpjDigits.padStart(14, '0')
  const serie5     = cfg.serie.slice(0, 5).padEnd(5)
  const numDps15   = String(cfg.numero).padStart(15, '0')
  const ibge7      = String(cfg.municipioIbge).slice(0, 7)
  const id         = `DPS${ibge7}${tipoInsc}${insc14}${serie5}${numDps15}`

  const mesRef = cob.mesRef || now.toISOString().slice(0, 7) // YYYY-MM

  // Tomador
  const cpfTomador = digits(cob.cpf || '')
  const tomadorTag = cpfTomador.length === 11
    ? `<CPF>${cpfTomador}</CPF>`
    : cpfTomador.length === 14
      ? `<CNPJ>${cpfTomador}</CNPJ>`
      : '<CPF>00000000000</CPF>'

  // Discriminação
  const discrim = [
    `Administração imobiliária ref. ${mesRef}`,
    cob.property ? `Imóvel: ${cob.property}` : '',
    cob.value > 0            ? `Aluguel: R$ ${Number(cob.value).toFixed(2)}` : '',
    cob.seguroFinanceiro > 0 ? `Seguro Financeiro: R$ ${Number(cob.seguroFinanceiro).toFixed(2)}` : '',
    cob.seguroIncendio > 0   ? `Seguro Incêndio: R$ ${Number(cob.seguroIncendio).toFixed(2)}` : '',
    cob.iptu > 0             ? `IPTU: R$ ${Number(cob.iptu).toFixed(2)}` : '',
    `Total: R$ ${Number(cob.totalValue).toFixed(2)}`,
  ].filter(Boolean).join(' | ')

  const valorTotal = Number(cob.totalValue).toFixed(2)

  // O namespace DEVE ser declarado no infDPS (necessário para C14N)
  const ns = 'http://www.sped.fazenda.gov.br/nfse'

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
`<DPS xmlns="${ns}" versao="1.00">\n` +
`<infDPS xmlns="${ns}" Id="${id}" versao="1.00">\n` +
`<tpAmb>${tpAmb}</tpAmb>\n` +
`<dhEmi>${dhEmi}</dhEmi>\n` +
`<verAplic>NOTAFACIL-1.0</verAplic>\n` +
`<serie>${escXml(cfg.serie.trim())}</serie>\n` +
`<nDPS>${cfg.numero}</nDPS>\n` +
`<dCompet>${mesRef}</dCompet>\n` +
`<prest>\n` +
(tipoInsc === '2' ? `<CNPJ>${cnpjDigits}</CNPJ>\n` : `<CPF>${cnpjDigits.slice(-11)}</CPF>\n`) +
`<IM>${escXml(cfg.inscMun)}</IM>\n` +
`<xNome>${escXml(cfg.razaoSocial.slice(0, 150))}</xNome>\n` +
`<end>\n` +
`<xLgr>${escXml(cfg.logradouro.slice(0, 125))}</xLgr>\n` +
`<nro>${escXml(cfg.numeroEnd.slice(0, 10))}</nro>\n` +
`<xBairro>${escXml(cfg.bairro.slice(0, 72))}</xBairro>\n` +
`<cMun>${ibge7}</cMun>\n` +
(cfg.cep ? `<CEP>${cfg.cep.padStart(8,'0')}</CEP>\n` : '') +
`</end>\n` +
`</prest>\n` +
`<toma>\n` +
`${tomadorTag}\n` +
`<xNome>${escXml((cob.tenant || 'Inquilino').slice(0, 150))}</xNome>\n` +
`</toma>\n` +
`<serv>\n` +
`<locPrest>\n` +
`<cLocPrestacao>${ibge7}</cLocPrestacao>\n` +
`</locPrest>\n` +
`<cServ>\n` +
`<cLC116>${cfg.codigoServico}</cLC116>\n` +
`<xDescServ>Administracao e intermediacao de imoveis</xDescServ>\n` +
`</cServ>\n` +
`<infoCompl>\n` +
`<xInfComp>${escXml(discrim.slice(0, 2000))}</xInfComp>\n` +
`</infoCompl>\n` +
`</serv>\n` +
`<valores>\n` +
`<vServPrest>\n` +
`<vReceb>${valorTotal}</vReceb>\n` +
`</vServPrest>\n` +
`<trib>\n` +
`<tribMun>\n` +
`<tribISSQN>1</tribISSQN>\n` +
`<pAliq>${cfg.aliquota}</pAliq>\n` +
`</tribMun>\n` +
`<totTrib><pTotTrib/></totTrib>\n` +
`</trib>\n` +
`</valores>\n` +
`</infDPS>\n` +
`</DPS>`
}

function escXml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ── XMLDSig RSA-SHA1 (padrão NF-e/NFS-e brasileiro) ──────────────
function signDps(xmlStr, privateKey, certForge) {
  // Extrai o bloco infDPS (com namespace próprio — necessário para C14N)
  const infDpsMatch = xmlStr.match(/<infDPS[\s\S]*?<\/infDPS>/)
  if (!infDpsMatch) throw new Error('infDPS não encontrado no XML')
  const infDpsStr = infDpsMatch[0]

  // C14N simplificado: o XML é gerado de forma canônica por construção.
  // A única normalização necessária é garantir que o namespace está no infDPS
  // e remover a declaração XML e qualquer whitespace ao redor.
  const canonical = infDpsStr.trim()

  // SHA-1 digest do infDPS
  const md1 = forge.md.sha1.create()
  md1.update(canonical, 'utf8')
  const digestValue = forge.util.encode64(md1.digest().getBytes())

  // Id de referência (Id="DPS...")
  const idMatch = canonical.match(/Id="([^"]+)"/)
  const refId = idMatch ? idMatch[1] : ''

  // SignedInfo (sem namespace wrapper — inserido no Signature)
  const signedInfoContent =
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
    `<Reference URI="#${refId}">` +
      `<Transforms>` +
        `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
        `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
      `</Transforms>` +
      `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
      `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>`

  const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfoContent}</SignedInfo>`

  // Canonicaliza SignedInfo e assina com RSA-SHA1
  const md2 = forge.md.sha1.create()
  md2.update(signedInfo, 'utf8')
  const sigBytes = privateKey.sign(md2)
  const signatureValue = forge.util.encode64(sigBytes)

  // Certificado em DER base64
  const certDer = forge.util.encode64(
    forge.asn1.toDer(forge.pki.certificateToAsn1(certForge)).getBytes()
  )

  // Monta o elemento Signature completo
  const signatureXml =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
      signedInfo +
      `<SignatureValue>${signatureValue}</SignatureValue>` +
      `<KeyInfo><X509Data><X509Certificate>${certDer}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`

  // Insere antes de </DPS>
  return xmlStr.replace('</DPS>', signatureXml + '\n</DPS>')
}

// ── POST com mTLS (certificado do cliente) ────────────────────────
function postWithMtls(url, body, certPem, keyPem) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      cert:     certPem,
      key:      keyPem,
      headers: {
        'Content-Type':   'application/xml; charset=UTF-8',
        'Accept':         'application/xml',
        'Content-Length': Buffer.byteLength(body, 'utf8'),
      },
    }
    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end',  () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout na chamada ao SEFIN')) })
    req.write(body, 'utf8')
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
