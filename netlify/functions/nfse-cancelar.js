// Netlify Function — cancela NFS-e emitida via SEFIN Nacional
// POST { userId, emissaoId, homologacao? }
//
// Fluxo correto (conforme manual v1.2 e XSD v1.01 da API):
//   1. Busca emissão no Supabase (valida dono, status e prazo de 48h)
//   2. Busca perfil do prestador (certificado, CNPJ, IBGE)
//   3. Monta XML pedRegEvento com evento e101101 (Cancelamento de NFS-e)
//   4. Assina com XMLDSig RSA-SHA256 (mesmo padrão da emissão)
//   5. GZip + Base64 → POST JSON com mTLS em /SefinNacional/nfse/{chaveAcesso}/eventos
//   6. Atualiza status = 'cancelada' no Supabase
//
// REFERÊNCIA TÉCNICA:
//   - XSD: pedRegEvento_v1.01.xsd + tiposEventos_v1.01.xsd
//   - Endpoint: POST /nfse/{chaveAcesso}/eventos  (API Eventos, seção 1.5 do manual)
//   - Evento: e101101 (Cancelamento de NFS-e) — cMotivo: 1=Erro na Emissão
//   - Id do pedRegEvento: PRE + chNFSe(50 digits) + 101101

const https      = require('https')
const crypto     = require('crypto')
const zlib       = require('zlib')
const forge      = require('node-forge')
const xmlCrypto  = require('xml-crypto')

const SEFIN_BASE_PROD = 'https://sefin.nfse.gov.br/SefinNacional/nfse'
const SEFIN_BASE_TEST = 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse'

// Motivo fixo: 1 = Erro na Emissão (conforme XSD TSCodJustCanc)
const MOTIVO_CANCEL = '1'
// xMotivo: mínimo 15 chars, máximo 255 chars (TSMotivo)
const XMOTIVO_TEXT = 'Nota emitida com erro pelo prestador de servicos.'

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

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  const CERT_KEY     = process.env.NFSE_CERT_KEY

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
  if (!em.chave_acesso) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Chave de acesso da NFS-e não disponível para cancelamento' }) }
  }

  // Valida que a chave tem 50 dígitos numéricos (requisito do XSD TSChaveNFSe)
  const chaveOk = /^\d{50}$/.test(em.chave_acesso)
  if (!chaveOk) {
    return { statusCode: 400, body: JSON.stringify({ error: `Chave de acesso inválida: "${em.chave_acesso}" (esperado 50 dígitos numéricos)` }) }
  }

  // Valida janela de 48h
  const emitidaEm  = new Date(em.created_at)
  const limiteCanc = new Date(emitidaEm.getTime() + 48 * 60 * 60 * 1000)
  if (new Date() > limiteCanc) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Prazo de cancelamento expirado (máximo 48h após emissão)' }) }
  }

  // ── 2. Busca perfil do prestador ───────────────────────────────
  const profRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}&select=cnpj,nfse_cert_path,nfse_cert_password_enc`, 'GET')

  if (!profRes.ok) {
    const errBody = await profRes.text()
    console.error('[nfse-cancelar] Erro ao buscar perfil HTTP', profRes.status, errBody)
    return { statusCode: 500, body: JSON.stringify({ error: `Erro ao buscar perfil: ${profRes.status}` }) }
  }

  const profRows = await profRes.json()
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

  // ── 4. Monta XML pedRegEvento ──────────────────────────────────
  // Conforme XSD pedRegEvento_v1.01.xsd + tiposEventos_v1.01.xsd
  const cnpjDigits = (p.cnpj || '').replace(/\D/g, '')
  const isCnpj     = cnpjDigits.length === 14
  const autorTag   = isCnpj
    ? `<CNPJAutor>${cnpjDigits}</CNPJAutor>`
    : `<CPFAutor>${cnpjDigits.slice(-11)}</CPFAutor>`

  // Id = PRE + chNFSe(50) + codigoEvento(6) — padrão TSIdPedRegEvt PRE[0-9]{56}
  const codigoEvento = '101101'  // e101101 = Cancelamento de NFS-e
  const idPedReg     = `PRE${em.chave_acesso}${codigoEvento}`

  // Data/hora em BRT com margem de 5s contra clock drift
  const brt      = new Date(new Date().getTime() - 5000 - 3 * 3600 * 1000)
  const dhEvento = brt.toISOString().replace(/\.\d+Z$/, '-03:00')
  const tpAmb    = homologacao ? '2' : '1'

  const pedRegEventoXml = `<?xml version="1.0" encoding="UTF-8"?>
<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
<infPedReg Id="${idPedReg}">
<tpAmb>${tpAmb}</tpAmb>
<verAplic>NOTAFACIL-1.0</verAplic>
<dhEvento>${dhEvento}</dhEvento>
${autorTag}
<chNFSe>${em.chave_acesso}</chNFSe>
<nPedRegEvento>1</nPedRegEvento>
<e101101>
<xDesc>Cancelamento de NFS-e</xDesc>
<cMotivo>${MOTIVO_CANCEL}</cMotivo>
<xMotivo>${XMOTIVO_TEXT}</xMotivo>
</e101101>
</infPedReg>
</pedRegEvento>`

  console.log('[nfse-cancelar] pedRegEvento XML montado | Id:', idPedReg, '| chNFSe:', em.chave_acesso)

  // ── 5. Assina o XML ────────────────────────────────────────────
  let pedRegEventoXmlSigned
  try {
    pedRegEventoXmlSigned = signXml(pedRegEventoXml, privateKey, certForge, idPedReg)
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: `Erro ao assinar XML: ${err.message}` }) }
  }

  // ── 6. Envia POST mTLS ao SEFIN — API Eventos ─────────────────
  // Endpoint: POST /SefinNacional/nfse/{chaveAcesso}/eventos
  const sefinBase = homologacao ? SEFIN_BASE_TEST : SEFIN_BASE_PROD
  const sefinUrl  = `${sefinBase}/${em.chave_acesso}/eventos`

  console.log('[nfse-cancelar] enviando para SEFIN:', sefinUrl)

  let sefinStatus, sefinBody
  try {
    const result = await postEventoMtls(sefinUrl, pedRegEventoXmlSigned, certPem, keyPem)
    sefinStatus  = result.status
    sefinBody    = result.body
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: `Erro na comunicação com SEFIN: ${err.message}` }) }
  }

  console.log('[nfse-cancelar] SEFIN status:', sefinStatus, '| body:', sefinBody)

  // SEFIN retorna 200 ou 201 em caso de sucesso
  if (sefinStatus !== 200 && sefinStatus !== 201 && sefinStatus !== 204) {
    if (sefinStatus === 503 || sefinStatus === 502 || sefinStatus === 504) {
      return {
        statusCode: 503,
        body: JSON.stringify({
          error: 'O serviço de cancelamento do SEFIN está temporariamente indisponível. Tente novamente em alguns minutos.',
          sefinStatus,
        }),
      }
    }

    // Tenta extrair mensagem amigável do retorno SEFIN
    let errMsg = `SEFIN HTTP ${sefinStatus}`
    try {
      const parsed = JSON.parse(sefinBody)
      const detalhe = parsed?.message || parsed?.xMotivo ||
        (Array.isArray(parsed?.erros) ? parsed.erros.map(e => e.xMsg || e.Descricao || e.descricao).join('; ') : null)
      if (detalhe) errMsg += `: ${detalhe}`
    } catch {
      // body não é JSON — mostra início do texto
      errMsg += ` — ${sefinBody.slice(0, 200)}`
    }
    console.error('[nfse-cancelar] SEFIN ERRO | status:', sefinStatus, '| body COMPLETO:', sefinBody)
    return { statusCode: 400, body: JSON.stringify({ error: errMsg, sefinStatus, sefinRaw: sefinBody.slice(0, 500) }) }
  }

  // ── 7. Atualiza status no Supabase ─────────────────────────────
  await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `nfse_emissoes?id=eq.${emissaoId}`, 'PATCH', {
      status:              'cancelada',
      cancelado_em:        new Date().toISOString(),
      motivo_cancelamento: MOTIVO_CANCEL,
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

// POST /SefinNacional/nfse/{chaveAcesso}/eventos com mTLS
// Corpo JSON: { pedidoRegistroEventoXmlGZipB64: "..." }
// ATENÇÃO: campo DIFERENTE da emissão (dpsXmlGZipB64). Confirmado pelo fórum ACBr.
async function postEventoMtls(url, xmlBody, certPem, keyPem) {
  const gz                             = await gzipBuffer(Buffer.from(xmlBody, 'utf8'))
  const pedidoRegistroEventoXmlGZipB64 = gz.toString('base64')
  const jsonBody                       = JSON.stringify({ pedidoRegistroEventoXmlGZipB64 })
  const bodyBuf                        = Buffer.from(jsonBody, 'utf8')

  console.log('[nfse-cancelar] JSON body length:', bodyBuf.length, '| GZipB64 length:', pedidoRegistroEventoXmlGZipB64.length)
  console.log('[nfse-cancelar] XML pedRegEvento (primeiros 500 chars):', xmlBody.slice(0, 500))

  const doRequest = () => new Promise((resolve, reject) => {
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

  // Retry automático em caso de 503 (indisponibilidade temporária do SEFIN)
  const MAX_TENTATIVAS = 3
  const BACKOFF_MS     = 4000

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const result = await doRequest()
    if (result.status !== 503 && !result.body.includes('Service Unavailable')) {
      return result
    }
    if (tentativa < MAX_TENTATIVAS) {
      console.warn(`[nfse-cancelar] SEFIN 503 (tentativa ${tentativa}/${MAX_TENTATIVAS}) — aguardando ${BACKOFF_MS}ms`)
      await new Promise(r => setTimeout(r, BACKOFF_MS))
    }
  }

  return { status: 503, body: 'Service Unavailable' }
}
