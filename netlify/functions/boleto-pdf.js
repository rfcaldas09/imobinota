'use strict'
// boleto-pdf.js — gera PDF de boleto bancário Viacredi (AILOS 085)
// Mesma lógica de nosso número / barcode que cnab-gerar.js
//
// POST { userId, emissaoIds: [uuid, ...], contaId? }
//   → { pdfBase64, filename, totalBoletos }

const PDFDocument = require('pdfkit/js/pdfkit.standalone.js')
const { checkParentAuth } = require('./_parent-auth')

// ══════════════════════════════════════════════════════════
//  Helpers CNAB / Barcode
// ══════════════════════════════════════════════════════════

/** Pad numérico à esquerda com zeros */
function N(v, len) {
  return String(v || '').replace(/\D/g, '').padStart(len, '0').slice(-len)
}

/** DV Módulo 10 (usado nos 3 campos da linha digitável) */
function dvMod10(s) {
  let sum = 0, w = 2
  for (let i = s.length - 1; i >= 0; i--) {
    let d = parseInt(s[i]) * w
    if (d > 9) d -= 9
    sum += d
    w = w === 2 ? 1 : 2
  }
  const r = sum % 10
  return r === 0 ? 0 : 10 - r
}

/** DV Módulo 11 do código de barras (pesos 2-9 da direita) */
function dvMod11Barcode(s) {
  const W = [2, 3, 4, 5, 6, 7, 8, 9]
  let sum = 0
  for (let i = s.length - 1, wi = 0; i >= 0; i--, wi++) {
    sum += parseInt(s[i]) * W[wi % 8]
  }
  const r = sum % 11
  if (r === 0 || r === 1 || r === 10 || r === 11) return 1
  return 11 - r
}

/**
 * Fator de vencimento (novo ciclo iniciado em 22/02/2025 = fator 1000)
 * aceita 'DD/MM/AAAA' ou 'AAAA-MM-DD[T...]'
 */
function fatorVencimento(dataStr) {
  if (!dataStr) return 0
  let d
  if (dataStr.includes('/')) {
    const [dd, mm, yyyy] = dataStr.split('/')
    d = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`)
  } else {
    d = new Date(dataStr.slice(0, 10) + 'T12:00:00Z')
  }
  const base = new Date('2025-02-22T12:00:00Z')
  return 1000 + Math.round((d - base) / 86400000)
}

/**
 * Nosso número Viacredi (17 chars úteis):
 *   conta_7dig + dvConta(1) + seq_9dig
 * idêntico ao nossoNumero240() de cnab-gerar.js (sem os 3 espaços finais)
 */
function nossoNumero(conta, contaDv, seq) {
  const conta7  = N(conta, 7)
  const dv1     = String(contaDv || '0').slice(0, 1)
  const seq9    = N(String(seq).replace(/\D/g, ''), 9)
  return conta7 + dv1 + seq9   // 17 chars
}

/** Código de barras completo (44 dígitos) */
function buildBarcode({ convenio, conta, contaDv, carteira, seq, vencimento, valor }) {
  const banco  = '085'
  const moeda  = '9'
  const fator  = fatorVencimento(vencimento)
  const fStr   = String(fator).padStart(4, '0')
  const vCents = Math.round(
    parseFloat(String(valor).replace(/[^\d,.]/g, '').replace(',', '.')) * 100
  )
  const vStr   = String(vCents).padStart(10, '0')

  // Campo livre (25 chars): convenio(6) + conta7(7) + dvConta(1) + seq9(9) + '0' + carteira(1)
  const cl = N(convenio, 6) +
             N(conta, 7) +
             String(contaDv || '0').slice(0, 1) +
             N(String(seq).replace(/\D/g, ''), 9) +
             '0' +
             N(carteira || '1', 1)

  const semDV = banco + moeda + fStr + vStr + cl
  const dv    = dvMod11Barcode(semDV)
  return banco + moeda + String(dv) + fStr + vStr + cl
}

/** Linha digitável (47 dígitos formatados) */
function buildLinhaDigitavel(barcode) {
  const cl = barcode.slice(19)   // campo livre 25 chars

  // Campo 1: banco(3)+moeda(1)+cl[0..4] = 9 chars
  const c1num = barcode.slice(0, 4) + cl.slice(0, 5)
  const c1dv  = dvMod10(c1num)
  const c1    = c1num.slice(0, 5) + '.' + c1num.slice(5) + c1dv

  // Campo 2: cl[5..14] = 10 chars
  const c2num = cl.slice(5, 15)
  const c2dv  = dvMod10(c2num)
  const c2    = c2num.slice(0, 5) + '.' + c2num.slice(5) + c2dv

  // Campo 3: cl[15..24] = 10 chars
  const c3num = cl.slice(15, 25)
  const c3dv  = dvMod10(c3num)
  const c3    = c3num.slice(0, 5) + '.' + c3num.slice(5) + c3dv

  const dvGeral    = barcode[4]
  const fatorValor = barcode.slice(5, 19)

  return `${c1}  ${c2}  ${c3}  ${dvGeral}  ${fatorValor}`
}

// ══════════════════════════════════════════════════════════
//  Barcode visual ITF-25 (Interleaved 2 of 5)
// ══════════════════════════════════════════════════════════

const ITF = {
  '0':'NNWWN','1':'WNNNW','2':'NWNNW','3':'WWNNN','4':'NNWNW',
  '5':'WNWNN','6':'NWWNN','7':'NNNWW','8':'WNNWN','9':'NWNWN',
}
const N_WIDTH = 1   // narrow unit
const W_WIDTH = 3   // wide unit

function drawBarcodeITF(doc, digits, x, y, totalWidth, barHeight) {
  let s = digits
  if (s.length % 2 !== 0) s = '0' + s   // must be even

  // Build sequence of [unit, isBar] pairs
  const seq = []
  // Start: bar(1) space(1) bar(1) space(1)
  seq.push([N_WIDTH, true],[N_WIDTH, false],[N_WIDTH, true],[N_WIDTH, false])

  for (let i = 0; i < s.length; i += 2) {
    const p1 = ITF[s[i]]
    const p2 = ITF[s[i + 1]]
    for (let j = 0; j < 5; j++) {
      seq.push([p1[j] === 'W' ? W_WIDTH : N_WIDTH, true])    // bar
      seq.push([p2[j] === 'W' ? W_WIDTH : N_WIDTH, false])   // space
    }
  }
  // Stop: wide-bar(3) space(1) bar(1)
  seq.push([W_WIDTH, true],[N_WIDTH, false],[N_WIDTH, true])

  const totalUnits = seq.reduce((a, [u]) => a + u, 0)
  const unit = totalWidth / totalUnits

  let cx = x
  for (const [units, isBar] of seq) {
    const w = units * unit
    if (isBar) {
      doc.rect(cx, y, w - 0.3, barHeight).fill('#000000')
    }
    cx += w
  }
}

// ══════════════════════════════════════════════════════════
//  Formatação
// ══════════════════════════════════════════════════════════

function fmtMoney(v) {
  const n = parseFloat(String(v).replace(/[^\d,.]/g, '').replace(',', '.'))
  if (isNaN(n)) return '0,00'
  return n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function fmtDate(s) {
  if (!s) return ''
  if (s.includes('/')) return s
  const p = s.slice(0, 10).split('-')
  return `${p[2]}/${p[1]}/${p[0]}`
}

function fmtCnpj(s) {
  const d = String(s || '').replace(/\D/g, '')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return s || ''
}

// ══════════════════════════════════════════════════════════
//  PDF — layout boleto
// ══════════════════════════════════════════════════════════

function buildPdf(boletos) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false })
    const buffers = []
    doc.on('data', b => buffers.push(b))
    doc.on('end',  () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)
    for (const b of boletos) {
      doc.addPage()
      drawBoleto(doc, b)
    }
    doc.end()
  })
}

function drawBoleto(doc, b) {
  const PW   = 595.28
  const PH   = 841.89
  const ML   = 36, MR = 36
  const W    = PW - ML - MR

  const BLUE  = '#004A96'
  const DGRAY = '#333333'
  const GRAY  = '#666666'
  const LGRAY = '#BBBBBB'

  function hline(y, color = LGRAY, lw = 0.4) {
    doc.moveTo(ML, y).lineTo(ML + W, y).strokeColor(color).lineWidth(lw).stroke()
  }
  function vline(x, y1, y2, color = LGRAY, lw = 0.4) {
    doc.moveTo(x, y1).lineTo(x, y2).strokeColor(color).lineWidth(lw).stroke()
  }
  function lbl(txt, x, y, w) {
    doc.font('Helvetica').fontSize(6).fillColor(GRAY)
       .text(txt, x, y, { width: w, lineBreak: false })
  }
  function val(txt, x, y, w, opts = {}) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(DGRAY)
       .text(String(txt || ''), x, y, { width: w, lineBreak: false, ...opts })
  }
  function field(label, value, x, y, w, h = 22) {
    lbl(label, x + 2, y + 2, w - 4)
    val(value, x + 2, y + 10, w - 4)
    return y + h
  }

  let y = 36

  // ── CABEÇALHO ─────────────────────────────────────────────
  // Faixa azul
  doc.rect(ML, y, W, 28).fill(BLUE)
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#FFFFFF')
     .text('VIACREDI  |  085-X', ML + 8, y + 7, { width: 200, lineBreak: false })
  doc.font('Courier-Bold').fontSize(9.5).fillColor('#FFFFFF')
     .text(b.linhaDigitavel, ML + 220, y + 9, { width: W - 228, align: 'right', lineBreak: false })

  y += 36
  hline(y, BLUE, 0.6)
  y += 2

  // ── BENEFICIÁRIO ──────────────────────────────────────────
  const colR = W * 0.30
  const colL = W - colR - 4
  lbl('BENEFICIÁRIO', ML + 2, y, colL)
  lbl('CNPJ', ML + colL + 6, y, colR)
  y += 8
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DGRAY)
     .text(b.beneficiario, ML + 2, y, { width: colL, lineBreak: false })
  doc.font('Helvetica').fontSize(8).fillColor(DGRAY)
     .text(fmtCnpj(b.cnpj), ML + colL + 6, y, { width: colR, lineBreak: false })
  y += 14
  hline(y); y += 4

  // ── ROW: agência/convênio | nosso número | vencimento | valor ──
  const c1 = W * 0.28, c2 = W * 0.28, c3 = W * 0.18, c4 = W * 0.26
  let rx = ML
  lbl('AGÊNCIA / CONVÊNIO', rx + 2, y, c1); rx += c1
  vline(ML + c1, y, y + 24); lbl('NOSSO NÚMERO', rx + 2, y, c2); rx += c2
  vline(ML + c1 + c2, y, y + 24); lbl('VENCIMENTO', rx + 2, y, c3); rx += c3
  vline(ML + c1 + c2 + c3, y, y + 24); lbl('VALOR DO DOCUMENTO', rx + 2, y, c4)
  y += 8
  rx = ML
  doc.font('Helvetica').fontSize(8).fillColor(DGRAY)
  doc.text(`${b.agencia} / ${b.convenio}`, rx + 2, y, { width: c1 - 4, lineBreak: false }); rx += c1
  doc.text(b.nossoNumeroFmt, rx + 2, y, { width: c2 - 4, lineBreak: false }); rx += c2
  doc.text(b.vencimento, rx + 2, y, { width: c3 - 4, lineBreak: false }); rx += c3
  doc.font('Helvetica-Bold').fontSize(8).text(`R$ ${fmtMoney(b.valor)}`, rx + 2, y, { width: c4 - 4, lineBreak: false })
  y += 14
  hline(y); y += 4

  // ── INFORMAÇÕES OPCIONAIS ─────────────────────────────────
  const infoH = 18
  const ca = W * 0.25, cb = W * 0.25, cc2 = W * 0.25, cd = W * 0.25
  rx = ML
  lbl('ESPÉCIE DOC', rx + 2, y, ca); rx += ca
  vline(ML + ca, y, y + infoH)
  lbl('ACEITE', rx + 2, y, cb); rx += cb
  vline(ML + ca + cb, y, y + infoH)
  lbl('DATA DO DOCUMENTO', rx + 2, y, cc2); rx += cc2
  vline(ML + ca + cb + cc2, y, y + infoH)
  lbl('CARTEIRA', rx + 2, y, cd)
  y += 8; rx = ML
  doc.font('Helvetica').fontSize(8).fillColor(DGRAY)
  doc.text('DS', rx + 2, y, { width: ca - 4, lineBreak: false }); rx += ca
  doc.text('N', rx + 2, y, { width: cb - 4, lineBreak: false }); rx += cb
  doc.text(b.dataDocumento, rx + 2, y, { width: cc2 - 4, lineBreak: false }); rx += cc2
  doc.text(b.carteira, rx + 2, y, { width: cd - 4, lineBreak: false })
  y += 10
  hline(y); y += 4

  // ── INSTRUÇÕES ────────────────────────────────────────────
  if (b.instrucoes) {
    lbl('INSTRUÇÕES (Texto de responsabilidade do Beneficiário)', ML + 2, y, W * 0.65)
    y += 8
    doc.font('Helvetica').fontSize(7.5).fillColor(DGRAY)
       .text(b.instrucoes, ML + 2, y, { width: W * 0.65, lineBreak: true })
    y = doc.y + 4
  } else {
    y += 20
  }
  hline(y); y += 4

  // ── SACADO (PAGADOR) ──────────────────────────────────────
  lbl('PAGADOR', ML + 2, y, W * 0.65)
  lbl('CPF/CNPJ', ML + W * 0.67, y, W * 0.33)
  y += 8
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DGRAY)
     .text(b.sacado, ML + 2, y, { width: W * 0.65, lineBreak: false })
  doc.font('Helvetica').fontSize(8).fillColor(DGRAY)
     .text(fmtCnpj(b.sacadoCpf || ''), ML + W * 0.67, y, { width: W * 0.33, lineBreak: false })
  if (b.sacadoEndereco) {
    y += 11
    doc.font('Helvetica').fontSize(7.5).fillColor(DGRAY)
       .text(b.sacadoEndereco, ML + 2, y, { width: W * 0.75, lineBreak: false })
  }
  y += 14
  hline(y, BLUE, 0.8); y += 10

  // ── CÓDIGO DE BARRAS ──────────────────────────────────────
  // Posição fixa na parte inferior
  const bcY = PH - 100
  const bcH = 55

  // Linha de corte (tracejada)
  doc.moveTo(ML, bcY - 14).lineTo(ML + W, bcY - 14)
     .strokeColor(LGRAY).lineWidth(0.5).dash(4, { space: 4 }).stroke()
  doc.undash()
  doc.font('Helvetica').fontSize(6).fillColor(GRAY)
     .text('↓  CORTE AQUI  ↓', ML + W / 2 - 30, bcY - 24, { width: 80, lineBreak: false })

  // Barcode
  drawBarcodeITF(doc, b.barcode, ML + 8, bcY, W - 16, bcH)

  // Linha digitável abaixo do barcode
  doc.font('Courier').fontSize(10).fillColor(DGRAY)
     .text(b.linhaDigitavel, ML, bcY + bcH + 6, { width: W, align: 'center', lineBreak: false })
}

// ══════════════════════════════════════════════════════════
//  Supabase helper
// ══════════════════════════════════════════════════════════

async function sbFetch(url, key, path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
  }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(`${url}/rest/v1/${path}`, opts)
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    throw new Error(`Supabase [${method} ${path}]: ${r.status} ${txt}`)
  }
  return r.json()
}

// ══════════════════════════════════════════════════════════
//  Handler
// ══════════════════════════════════════════════════════════

exports.handler = async (event) => {
  try {
    return await handle(event)
  } catch (err) {
    console.error('[boleto-pdf]', err?.message)
    return { statusCode: 500, body: JSON.stringify({ error: err?.message }) }
  }
}

async function handle(event) {
  const SB_URL = process.env.SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY
  if (!SB_URL || !SB_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }

  let userId, emissaoIds, contaId
  if (event.httpMethod === 'POST') {
    const b = JSON.parse(event.body || '{}')
    userId     = b.userId
    emissaoIds = b.emissaoIds || (b.emissaoId ? [b.emissaoId] : [])
    contaId    = b.contaId
  } else {
    userId     = event.queryStringParameters?.userId
    emissaoIds = (event.queryStringParameters?.emissaoIds || '').split(',').filter(Boolean)
    contaId    = event.queryStringParameters?.contaId
  }

  if (!userId || !Array.isArray(emissaoIds) || emissaoIds.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId e emissaoIds são obrigatórios' }) }
  }

  const authError = await checkParentAuth(event, userId)
  if (authError) return authError

  // ── Busca perfil (cnab_config + dados do beneficiário) ────
  const profiles = await sbFetch(SB_URL, SB_KEY,
    `profiles?id=eq.${userId}&select=company_name,cnpj,cnab_config`
  )
  const profile = profiles[0] || {}

  // Seleciona conta bancária (mesma lógica de cnab-gerar.js)
  let contas = []
  const rawCfg = profile.cnab_config
  if (Array.isArray(rawCfg)) {
    contas = rawCfg
  } else if (rawCfg && typeof rawCfg === 'object') {
    contas = [{ id: 'legacy', banco: rawCfg.banco || 'bradesco', label: 'Bradesco', ...rawCfg }]
  }

  let cc
  if (contaId) {
    cc = contas.find(c => c.id === contaId)
  } else if (contas.length === 1) {
    cc = contas[0]
  }
  if (!cc) {
    return { statusCode: 422, body: JSON.stringify({ error: 'Conta bancária não encontrada. Informe contaId.' }) }
  }

  const banco = (cc.banco || 'viacredi').toLowerCase()
  if (banco !== 'viacredi') {
    return { statusCode: 422, body: JSON.stringify({ error: `boleto-pdf.js suporta apenas Viacredi. Banco configurado: ${banco}` }) }
  }

  // ── Busca emissões ────────────────────────────────────────
  const ids = emissaoIds.map(id => `"${id}"`).join(',')
  const emissoes = await sbFetch(SB_URL, SB_KEY,
    `nfse_emissoes?id=in.(${ids})&user_id=eq.${userId}` +
    `&select=id,numero_nfse,numero_dps,tomador_nome,valor_servico,created_at,competencia,cob_data_json`
  )

  if (!emissoes || emissoes.length === 0) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Nenhuma emissão encontrada.' }) }
  }

  // ── Monta dados de cada boleto ────────────────────────────
  const hoje = new Date()
  const dataHoje = `${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`

  const boletos = emissoes.map((em, idx) => {
    const cob    = em.cob_data_json || {}
    const seq    = em.numero_nfse || em.numero_dps || String(idx + 1)
    const venc   = cob.vencimento || cob.dataVencimento || ''
    const valor  = em.valor_servico || cob.totalValue || 0
    const sacado = em.tomador_nome || cob.tenant || ''

    const nn      = nossoNumero(cc.conta, cc.conta_dv, seq)
    const barcode = buildBarcode({
      convenio:  cc.convenio  || '101004',
      conta:     cc.conta,
      contaDv:   cc.conta_dv  || '0',
      carteira:  cc.carteira  || '1',
      seq,
      vencimento: venc,
      valor,
    })

    const nnFormatado = `${N(cc.conta, 7)}-${cc.conta_dv || '0'} / ${N(String(seq).replace(/\D/g,''), 9)}`

    return {
      beneficiario:    profile.company_name || '',
      cnpj:            profile.cnpj || '',
      agencia:         cc.agencia ? `${N(cc.agencia, 5)}-${cc.agencia_dv || '0'}` : '',
      convenio:        cc.convenio || '101004',
      nossoNumeroFmt:  nnFormatado,
      carteira:        cc.carteira || '1',
      vencimento:      fmtDate(venc),
      valor,
      dataDocumento:   dataHoje,
      sacado,
      sacadoCpf:       cob.cpf || '',
      sacadoEndereco:  cob.property || cob.endereco || '',
      instrucoes:      cob.instrucoes ||
                       `Referente a: ${em.competencia || cob.mesRef || ''}` +
                       (cob.property ? `\nImóvel: ${cob.property}` : ''),
      barcode,
      linhaDigitavel:  buildLinhaDigitavel(barcode),
    }
  })

  // ── Gera PDF ──────────────────────────────────────────────
  const pdfBuf  = await buildPdf(boletos)
  const dd      = String(hoje.getDate()).padStart(2, '0')
  const mm      = String(hoje.getMonth() + 1).padStart(2, '0')
  const filename = `boleto_${dd}${mm}${hoje.getFullYear()}_${emissaoIds[0].slice(0, 8)}.pdf`

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pdfBase64:    pdfBuf.toString('base64'),
      filename,
      totalBoletos: boletos.length,
    }),
  }
}
