// Netlify Function — envia (ou reenvia) o email da NFS-e com PDF + boleto opcional
//
// POST { userId, emissaoId, boletoPdfBase64?, boletoFilename? }
// → 200 { ok: true }

const { buildNfsePdf, extrairCamposPdf } = require('./nfse-pdf-lib')
const { checkParentAuth } = require('./_parent-auth')

exports.handler = async (event) => {
  try {
    return await handle(event)
  } catch (err) {
    console.error('[nfse-email-boleto]', err?.message)
    return { statusCode: 500, body: JSON.stringify({ error: err?.message }) }
  }
}

async function handle(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { userId, emissaoId, boletoPdfBase64, boletoFilename, homologacao = false } = body
  if (!userId || !emissaoId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId e emissaoId são obrigatórios' }) }
  }

  const authError = await checkParentAuth(event, userId)
  if (authError) return authError

  // ── 1. Busca emissão ─────────────────────────────────────────
  const emRes = await sbFetch(SUPABASE_URL, SERVICE_KEY,
    `nfse_emissoes?id=eq.${emissaoId}&user_id=eq.${userId}&select=*`)
  const emArr = await emRes.json()
  const em = Array.isArray(emArr) ? emArr[0] : null
  if (!em) return { statusCode: 404, body: JSON.stringify({ error: 'Emissão não encontrada' }) }

  // ── 2. Busca perfil ───────────────────────────────────────────
  const profRes = await sbFetch(SUPABASE_URL, SERVICE_KEY, `profiles?id=eq.${userId}&select=*`)
  const profArr = await profRes.json()
  const p = Array.isArray(profArr) ? (profArr[0] || {}) : {}

  // ── 3. Monta cobData (igual nfse-pdf.js) ─────────────────────
  let cobData = {
    tenant:          em.tomador_nome || '',
    totalValue:      em.valor_servico || '0',
    mesRef:          em.competencia  || '',
    cpf:             '',
    email:           '',
    property:        '',
  }
  if (em.cobranca_id) {
    const cobRes = await sbFetch(SUPABASE_URL, SERVICE_KEY,
      `cobrancas?id=eq.${em.cobranca_id}&select=contratos(imovel),inquilinos(nome,cpf,email)`)
    if (cobRes.ok) {
      const cobArr = await cobRes.json()
      const inq = Array.isArray(cobArr) ? cobArr[0]?.inquilinos : null
      const ctr = Array.isArray(cobArr) ? cobArr[0]?.contratos  : null
      if (inq) { cobData.tenant = inq.nome || cobData.tenant; cobData.cpf = inq.cpf || ''; cobData.email = inq.email || '' }
      if (ctr) { cobData.property = ctr.imovel || '' }
    }
  }
  if (!cobData.email && em.cob_data_json) {
    try {
      const cd = typeof em.cob_data_json === 'string' ? JSON.parse(em.cob_data_json) : em.cob_data_json
      if (cd.email) cobData.email = cd.email
    } catch (_) {}
  }
  if (em.discriminacao_servico) cobData.discriminacao = em.discriminacao_servico

  // ── 4. Gera PDF da NFS-e ─────────────────────────────────────
  const fields = extrairCamposPdf(em.xml_nfse || '', cobData, p)
  if (em.numero_nfse)     fields.numero = em.numero_nfse
  else if (em.numero_dps) fields.numero = String(em.numero_dps)
  if (em.chave_acesso) { fields.chave = em.chave_acesso; fields.certificacao = em.chave_acesso.slice(0, 9).toUpperCase() }
  if (em.created_at)   fields.dhEmi = em.created_at

  const nfsePdfBuffer  = await buildNfsePdf(fields)
  const nfsePdfBase64  = nfsePdfBuffer.toString('base64')
  const nfsePdfFilename = `NFS-e_${em.numero_nfse || em.id}_${(em.competencia || '').replace('-', '_')}.pdf`

  // ── 5. Envia email ────────────────────────────────────────────
  await enviarEmail({
    p, cobData, homologacao,
    nfsePdfBase64, nfsePdfFilename,
    boletoPdfBase64: boletoPdfBase64 || null,
    boletoFilename:  boletoFilename  || null,
    numeroNfse: em.numero_nfse || em.numero_dps || '',
  })

  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}

async function enviarEmail({ p, cobData, homologacao, nfsePdfBase64, nfsePdfFilename, boletoPdfBase64, boletoFilename, numeroNfse }) {
  const fromName = p.from_name || 'NotaFacil'
  const replyTo  = p.reply_to  || ''
  const subject  = p.email_subject || 'NFS-e {{mes}}/{{ano}}'
  const bodyTpl  = p.email_body    || 'Olá, {{cliente}}!\n\nSegue em anexo a nota fiscal de serviço referente à competência {{mes}}/{{ano}}.\n\nAtenciosamente,\n{{empresa}}'

  const [ano, mesNum] = String(cobData.mesRef || '').split('-')
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const mesNome = meses[parseInt(mesNum || '1', 10) - 1] || mesNum || ''

  const vars = {
    '{{cliente}}':    cobData.tenant   || '',
    '{{inquilino}}':  cobData.tenant   || '',
    '{{mes}}':        mesNome,
    '{{ano}}':        ano              || '',
    '{{imovel}}':     cobData.property || '',
    '{{valor}}':      'R$ ' + (parseFloat(cobData.totalValue || 0).toFixed(2)).replace('.', ','),
    '{{empresa}}':    p.company_name   || fromName,
    '{{vencimento}}': '',
    '{{link_boleto}}': '',
    '{{nfse_numero}}': String(numeroNfse || ''),
  }
  const applyVars = tpl => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(k, v), tpl)
  const subjectFinal = applyVars(subject)
  const bodyFinal    = applyVars(bodyTpl)
  const bodyHtml     = bodyFinal.replace(/\n/g, '<br>')

  const rawEmail = homologacao ? (replyTo || cobData.email || '') : (cobData.email || '')
  const toAddrs  = rawEmail.split(';').map(e => e.trim()).filter(Boolean)
  if (!toAddrs.length) {
    console.warn('[nfse-email-boleto] sem destinatário, pulando envio')
    return
  }

  const attachments = [{ filename: nfsePdfFilename, content: nfsePdfBase64 }]
  if (boletoPdfBase64 && boletoFilename) {
    attachments.push({ filename: boletoFilename, content: boletoPdfBase64 })
  }

  const provider = p.email_provider || 'resend'

  if (provider === 'resend') {
    const apiKey   = process.env.RESEND_API_KEY
    const fromAddr = process.env.RESEND_FROM_EMAIL
    if (!apiKey || !fromAddr) throw new Error('RESEND_API_KEY ou RESEND_FROM_EMAIL não configurados')

    const payload = {
      from:        `${fromName} <${fromAddr}>`,
      to:          toAddrs,
      subject:     subjectFinal,
      html:        `<div style="font-family:sans-serif;max-width:600px">${bodyHtml}</div>`,
      text:        bodyFinal,
      attachments,
      ...(replyTo && !homologacao ? { reply_to: replyTo, cc: [replyTo] } : {}),
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
    // Convert base64 attachments to Buffer for nodemailer
    const nmAttachments = attachments.map(a => ({
      filename: a.filename,
      content:  Buffer.from(a.content, 'base64'),
    }))
    await transporter.sendMail({
      from:        `${fromName} <${p.from_email || p.smtp_user}>`,
      to:          toAddrs.join(', '),
      ...(replyTo && !homologacao ? { replyTo, cc: replyTo } : {}),
      subject:     subjectFinal,
      html:        `<div style="font-family:sans-serif;max-width:600px">${bodyHtml}</div>`,
      text:        bodyFinal,
      attachments: nmAttachments,
    })
  }
}

// ── Supabase helper ───────────────────────────────────────────────
function sbFetch(url, key, path, method = 'GET', body) {
  return fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}
