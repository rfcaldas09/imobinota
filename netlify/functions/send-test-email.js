// Netlify Function — envia e-mail de teste via Resend (plataforma) ou SMTP (cliente)
// Resend: usa RESEND_API_KEY e RESEND_FROM_EMAIL do ambiente (Netlify env vars)
// SMTP:   usa as credenciais configuradas pelo cliente
const nodemailer = require('nodemailer')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const {
    provider, to, fromName, replyTo,
    // SMTP apenas
    smtpHost, smtpPort, smtpUser, smtpPass, smtpEncryption, fromEmail,
  } = body

  try {
    if (provider === 'resend') {
      // ── Resend: tudo via variáveis de ambiente da plataforma ───
      const apiKey   = process.env.RESEND_API_KEY
      const fromAddr = process.env.RESEND_FROM_EMAIL

      if (!apiKey) {
        return { statusCode: 500, body: JSON.stringify({ error: 'RESEND_API_KEY não configurada no servidor. Contate o suporte.' }) }
      }
      if (!fromAddr) {
        return { statusCode: 500, body: JSON.stringify({ error: 'RESEND_FROM_EMAIL não configurada no servidor. Contate o suporte.' }) }
      }

      const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#4f46e5;margin-bottom:8px">✅ Configuração funcionando!</h2>
          <p style="color:#475569">Este é um e-mail de teste enviado pelo <strong>NotaFacil</strong>
            em nome de <strong>${fromName || 'sua empresa'}</strong>.</p>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px">Remetente: ${fromName || 'NotaFacil'} &lt;${fromAddr}&gt;</p>
        </div>`

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:    `${fromName || 'NotaFacil'} <${fromAddr}>`,
          to:      [to],
          ...(replyTo ? { reply_to: replyTo } : {}),
          subject: 'Teste de e-mail — NotaFacil',
          html,
          text:    `Configuração funcionando! E-mail de teste do NotaFacil em nome de ${fromName || 'sua empresa'}.`,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        return { statusCode: 400, body: JSON.stringify({ error: data.message || `Erro Resend: ${res.status}` }) }
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }

    } else {
      // ── SMTP: credenciais do próprio cliente ───────────────────
      const missing = []
      if (!smtpHost)  missing.push('Servidor SMTP')
      if (!smtpUser)  missing.push('Usuário SMTP')
      if (!smtpPass)  missing.push('Senha SMTP')
      if (!fromEmail) missing.push('E-mail remetente')
      if (missing.length) {
        return { statusCode: 400, body: JSON.stringify({ error: `Campos obrigatórios faltando: ${missing.join(', ')}` }) }
      }

      const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#4f46e5;margin-bottom:8px">✅ Configuração SMTP funcionando!</h2>
          <p style="color:#475569">Este é um e-mail de teste enviado pelo <strong>NotaFacil</strong> via SMTP.</p>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px">De: ${fromName || 'NotaFacil'} &lt;${fromEmail}&gt;</p>
        </div>`

      const transporter = nodemailer.createTransport({
        host:   smtpHost,
        port:   Number(smtpPort) || 587,
        secure: smtpEncryption === 'ssl',
        auth:   { user: smtpUser, pass: smtpPass },
        ...(smtpEncryption === 'none' ? { tls: { rejectUnauthorized: false } } : {}),
      })

      await transporter.sendMail({
        from:    `${fromName || 'NotaFacil'} <${fromEmail}>`,
        to,
        ...(replyTo ? { replyTo } : {}),
        subject: 'Teste de e-mail — NotaFacil',
        html,
        text:    'Configuração SMTP funcionando! E-mail de teste do NotaFacil.',
      })

      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
