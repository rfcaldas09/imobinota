// Netlify Function — cancela NFS-e emitida via SEFIN Nacional
// POST { userId, emissaoId, homologacao? }
//
// Fluxo:
//   1. Busca emissão no Supabase (valida dono, status e prazo de 48h)
//   2. Busca perfil do prestador (certificado, IM, CNPJ, IBGE)
//   3. Monta XML de pedido de cancelamento e assina com cert A1
//   4. DELETE /SefinNacional/nfse/{chaveAcesso} via mTLS
//   5. Atualiza status = 'cancelada' no Supabase

const https       = require('https')
const crypto      = require('crypto')
const zlib        = require('zlib')
const forge       = require('node-forge')
const xmlCrypto   = require('xml-crypto')

const SEFIN_URL_PROD = 'https://sefin.nfse.gov.br/SefinNacional/nfse'
const SEFIN_URL_TEST = 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse'

// Motivo fixo: 1 = emitida com erro
const MOTIVO_CANCEL = '1'

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { userId, emissaoId, homologacao = false } = body
  if (!userId || !emissaoId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId e emissaoId são obrigatórios' }) }
  }

  const SUPABASE_URL  = process.env.SUPABASE_URL
  const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY
  const CERT_KEY      = process.env.NFSE_CERT_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }
  if (!CERT_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'NFSE_CERT_KEY não configurada' }) }
  }

  // ── 1. Busca emissão ───────────────────────────────────────────
  const emRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `nfse_emissoes?id=eq.${emissaoId}&user_id=eq.${userId}&select=*`, 'GET')
  const emRows = await emRes.json()
  const em = emRows?.[0]

  if (!em) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Emissão não encontrada' }) }
  }
  if (em.status !== 'emitida') {
    return { statusCode: 400, body: JSON.stringify({ error: `Não é possível cancelar uma nota com status "${em.status}"` }) }
  }
  if (!em.chave_acesso || !em.numero_nfse) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Chave de acesso ou número da NFS-e não disponíveis para cancelamento' }) }
  }

  // Valida janela de 48h
  const emitidaEm   = new Date(em.created_at)
  const limiteCanc  = new Date(emitidaEm.getTime() + 48 * 60 * 60 * 1000)
  if (new Date() > limiteCanc) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Prazo de cancelamento expirado (máximo 48h após emissão)' }) }
  }

  // ── 2. Busca perfil do prestador ───────────────────────────────
  const profRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}&select=cnpj,inscricao_municipal,nfse_municipio_ibge,nfse_cert_path,nfse_cert_password_enc,nfse_serie`, 'GET')

  if (!profRes.ok) {
    const errBody = await profRes.text()
    console.error('[nfse-cancelar] Erro ao buscar perfil HTTP', profRes.status, errBody)
    return { statusCode: 500, body: JSON.stringify({ error: `Erro ao buscar perfil: ${profRes.status} — ${errBody}` }) }
  }

  const profRows = await profRes.json()

  // Se Supabase retornou um objeto de erro em vez de array, loga e retorna mensagem clara
  if (!Array.isArray(profRows)) {
    console.error('[nfse-cancelar] Supabase retornou erro de schema:', JSON.stringify(profRows))
    return { statusCode: 500, body: JSON.stringify({ error: `Erro de schema: ${profRows?.message || JSON.stringify(profRows)}` }) }
  }

  const p = profRows[0]
  if (!p) return { statusCode: 404, body: JSON.stringify({ error: 'Perfil não encontrado' }) }
  if (!p.nfse_cert_path) return { statusCode: 400, body: JSON.stringify({ error: 'Certificado digital não configurado' }) }

  // ── 3. Descriptografa senha e extrai cert ─────────────────────
  let certPem, keyPem, certForge, privateKey
  try {
    const certPassword = decryptPassword(p.nfse_cert_password_enc, CERT_KEY)
    if (!certPassword) throw new Error('Senha do certificado não encontrada')
    const certBytes = await downloadCert(SUPABASE_URL, SERVICE_KEY, p.nfse_cert_path)
    const pfx = parsePfx(certBytes, certPassword)
    certPem    = pfx.certPem
    keyPem     = forge.pki.privateKeyToPem(pfx.privateKey)
    certForge  = pfx.certForge
    privateKey = pfx.privateKey
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: `Erro no certificado: ${err.message}` }) }
  }

  // ── 4. Monta XML de pedido de cancelamento ─────────────────────
  const digits    = v => String(v).replace(/\D/g, '')
  const cnpjDigits = digits(p.cnpj)
  const tipoInsc   = cnpjDigits.length === 14 ? '2' : '1'
  const insc14     = cnpjDigits.padStart(14, '0')
  const ibge7      = String(p.nfse_municipio_ibge).slice(0, 7)
  const serie5     = String(p.nfse_serie || '00001').slice(0, 5).padStart(5, '0')
  const tpAmb      = homologacao ? '2' : '1'

  // Id do PedCan: PED + ibge7(7) + tipoInsc(1) + cnpj(14) + serie(5) + numero_nfse padded(15)
  const nNfseStr  = String(em.numero_nfse).padStart(15, '0')
  const idPedCan  = `PED${ibge7}${tipoInsc}${insc14}${serie5}${nNfseStr}`

  const brt    = new Date(new Date().getTime() - 5000 - 3 * 3600 * 1000)
  const dhCanc = brt.toISOString().replace(/\.\d+Z$/, '-03:00')

  const pedCanXml = `<?xml version="1.0" encoding="UTF-8"?>
<PedCanNFSe xmlns="http://www.sped.fazenda.gov.br/nfse"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  versao="1.00">
<infPedCan Id="${idPedCan}" versao="1.00">
<chNFSe>${em.chave_acesso}</chNFSe>
<cMotCancNFSe>${MOTIVO_CANCEL}</cMotCancNFSe>
<dhCancNFSe>${dhCanc}</dhCancNFSe>
<prest>
${tipoInsc === '2' ? `<CNPJ>${cnpjDigits}</CNPJ>` : `<CPF>${cnpjDigits.slice(-11)}</CPF>`}
</prest>
</infPedCan>
</PedCanNFSe>`

  // Assina o XML
  let pedCanXmlSigned
  try {
    pedCanXmlSigned = signXml(pedCanXml, privateKey, certForge, idPedCan)
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: `Erro ao assinar XML: ${err.message}` }) }
  }

  // ── 5. Envia POST mTLS ao SEFIN ───────────────────────────────
  // Endpoint de cancelamento: POST /SefinNacional/nfse/cancelamento
  // A chave de acesso vai dentro do XML (chNFSe), não na URL
  const sefinBase = homologacao ? SEFIN_URL_TEST : SEFIN_URL_PROD
  const sefinUrl  = `${sefinBase}/cancelamento`

  let sefinStatus, sefinBody
  try {
    const result = await postCancelMtls(sefinUrl, pedCanXmlSigned, certPem, keyPem)
    sefinStatus  = result.status
    sefinBody    = result.body
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: `Erro na comunicação com SEFIN: ${err.message}` }) }
  }

  console.log('[nfse-cancelar] SEFIN status:', sefinStatus, '| body:', sefinBody)

  // SEFIN retorna 200 ou 204 em caso de sucesso
  if (sefinStatus !== 200 && sefinStatus !== 204) {
    // Tenta extrair mensagem amigável do retorno SEFIN
    let errMsg = `SEFIN retornou HTTP ${sefinStatus}`
    try {
      const parsed = JSON.parse(sefinBody)
      errMsg = parsed?.message || parsed?.xMotivo || parsed?.erros?.[0]?.xMsg || errMsg
    } catch {}
    return { statusCode: 400, body: JSON.stringify({ error: errMsg, sefinRaw: sefinBody }) }
  }

  // ── 6. Atualiza status no Supabase ─────────────────────────────
  await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `nfse_emissoes?id=eq.${emissaoId}`, 'PATCH', {
      status:               'cancelada',
      cancelado_em:         new Date().toISOString(),
      motivo_cancelamento:  MOTIVO_CANCEL,
    })

  console.log('[nfse-cancelar] Cancelamento concluído:', { emissaoId, chaveAcesso: em.chave_acesso })

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, emissaoId, canceladoEm: new Date().toISOString() }),
  }
}

// ── Helpers ────────────────────────────────────────────────────────

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

function parsePfx(pfxBuffer, password) {
  // Mesmo monkey-patch do nfse-emitir.js para cobrir forge 1.4.0
  const origFromDer = forge.asn1.fromDer
  forge.asn1.fromDer = function (bytes, opts) {
    if (opts === undefined || opts === true || opts === false) {
      opts = { strict: false, parseAllBytes: false }
    } else if (typeof opts === 'object') {
      opts = { strict: false, parseAllBytes: false, ...opts }
    }
    return origFromDer.call(this, bytes, opts)
  }
  try {
    const p12Asn1  = forge.asn1.fromDer(pfxBuffer.toString('binary'))
    const pfx      = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password)
    const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []
    const keyBags  = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []
    if (!certBags.length) throw new Error('Nenhum certificado encontrado no .pfx')
    if (!keyBags.length || !keyBags[0].key) throw new Error('Senha do certificado incorreta')
    return {
      privateKey: keyBags[0].key,
      certPem:    forge.pki.certificateToPem(certBags[0].cert),
      certForge:  certBags[0].cert,
    }
  } finally {
    forge.asn1.fromDer = origFromDer
  }
}

function signXml(xmlStr, privateKey, certForge, refId) {
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
  const keyInfoXml =
    `<KeyInfo><X509Data><X509Certificate>${certDer}</X509Certificate></X509Data></KeyInfo>`
  signed = signed.replace('</SignatureValue>', '</SignatureValue>' + keyInfoXml)
  return signed
}

function gzipBuffer(buf) {
  return new Promise((res, rej) =>
    zlib.gzip(buf, (err, out) => err ? rej(err) : res(out))
  )
}

// Cancelamento: POST /SefinNacional/nfse/{chaveAcesso} com body { pedCanXmlGZipB64 }
async function postCancelMtls(url, xmlBody, certPem, keyPem) {
  const gz               = await gzipBuffer(Buffer.from(xmlBody, 'utf8'))
  const pedCanXmlGZipB64 = gz.toString('base64')
  const jsonBody         = JSON.stringify({ pedCanXmlGZipB64 })
  const bodyBuf          = Buffer.from(jsonBody, 'utf8')

  return new Promise((resolve, reject) => {
    const parsed  = new URL(url)
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
      res.on('end', () =>
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })
      )
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout na chamada ao SEFIN')) })
    req.write(bodyBuf)
    req.end()
  })
}
