// Netlify Scheduled Function — lembrete de vencimento de plano (PIX)
// Roda diariamente às 10:00 UTC (07:00 Brasília).
// Envia e-mail para usuários cujo plano vence amanhã E que não têm cartão
// cadastrado (stripe_subscription_id IS NULL) — ou seja, pagam por PIX.
//
// Schedule configurado em netlify.toml:
//   [functions."plano-lembrete"]
//     schedule = "0 10 * * *"
//
// Variáveis de ambiente necessárias:
//   SUPABASE_URL         SUPABASE_SERVICE_KEY
//   RESEND_API_KEY       RESEND_FROM_EMAIL

exports.handler = async (event) => {
  const SUPABASE_URL  = process.env.SUPABASE_URL
  const SUPABASE_SVC  = process.env.SUPABASE_SERVICE_KEY
  const RESEND_KEY    = process.env.RESEND_API_KEY
  const RESEND_FROM   = process.env.RESEND_FROM_EMAIL || 'NotaFacil <comercial@techlinker.com.br>'

  if (!SUPABASE_URL || !SUPABASE_SVC) {
    console.error('[plano-lembrete] Supabase não configurado')
    return { statusCode: 500, body: 'Supabase não configurado' }
  }
  if (!RESEND_KEY) {
    console.error('[plano-lembrete] RESEND_API_KEY não configurado')
    return { statusCode: 500, body: 'RESEND_API_KEY não configurado' }
  }

  // ── Janela: plano_fim entre amanhã 00:00 UTC e depois de amanhã 00:00 UTC ──
  const now           = new Date()
  const tomorrowStart = new Date(now)
  tomorrowStart.setUTCHours(0, 0, 0, 0)
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1)

  const dayAfterStart = new Date(tomorrowStart)
  dayAfterStart.setUTCDate(dayAfterStart.getUTCDate() + 1)

  const fromISO = tomorrowStart.toISOString()
  const toISO   = dayAfterStart.toISOString()

  console.log('[plano-lembrete] Buscando planos que vencem entre', fromISO, 'e', toISO)

  // ── 1. Busca perfis que vencem amanhã sem cartão de crédito ────────────────
  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles` +
    `?plano_fim=gte.${encodeURIComponent(fromISO)}` +
    `&plano_fim=lt.${encodeURIComponent(toISO)}` +
    `&plano_tipo=in.(essencial,pro)` +
    `&stripe_subscription_id=is.null` +
    `&select=id,plano_tipo,plano_fim`,
    {
      headers: {
        'apikey':        SUPABASE_SVC,
        'Authorization': `Bearer ${SUPABASE_SVC}`,
      },
    }
  )

  const profiles = await profRes.json()

  if (!Array.isArray(profiles) || profiles.length === 0) {
    console.log('[plano-lembrete] Nenhum plano vencendo amanhã sem cartão')
    return { statusCode: 200, body: JSON.stringify({ enviados: 0 }) }
  }

  console.log('[plano-lembrete] Encontrados:', profiles.length, 'usuário(s)')

  // ── 2. Para cada perfil, busca e-mail e envia lembrete ────────────────────
  let enviados = 0
  const erros  = []

  for (const profile of profiles) {
    try {
      // Busca e-mail via Admin API do Supabase
      const userRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${profile.id}`,
        {
          headers: {
            'apikey':        SUPABASE_SVC,
            'Authorization': `Bearer ${SUPABASE_SVC}`,
          },
        }
      )
      const userData = await userRes.json()
      const email    = userData?.email
      if (!email) { erros.push({ id: profile.id, reason: 'email não encontrado' }); continue }

      const planoNome  = profile.plano_tipo === 'pro' ? 'NotaFacil Pro' : 'NotaFacil Essencial'
      const vencimento = new Date(profile.plano_fim).toLocaleDateString('pt-BR')

      // Envia e-mail via Resend
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    RESEND_FROM,
          to:      [email],
          subject: `⚠️ Seu plano NotaFacil vence amanhã (${vencimento})`,
          html:    buildEmailHtml({ email, planoNome, vencimento }),
        }),
      })

      if (!emailRes.ok) {
        const errBody = await emailRes.text()
        erros.push({ id: profile.id, email, reason: errBody })
        console.error('[plano-lembrete] Falha ao enviar para', email, errBody)
      } else {
        enviados++
        console.log('[plano-lembrete] Lembrete enviado para', email)
      }
    } catch (err) {
      erros.push({ id: profile.id, reason: err.message })
      console.error('[plano-lembrete] Erro ao processar', profile.id, err.message)
    }
  }

  console.log('[plano-lembrete] Concluído. Enviados:', enviados, '| Erros:', erros.length)
  return {
    statusCode: 200,
    body: JSON.stringify({ enviados, erros }),
  }
}

// ── Template de e-mail ─────────────────────────────────────────────────────
function buildEmailHtml({ email, planoNome, vencimento }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seu plano vence amanhã</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#4f46e5;padding:28px 32px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">NotaFacil</p>
              <p style="margin:4px 0 0;color:#c7d2fe;font-size:13px;">by Techlinker</p>
            </td>
          </tr>

          <!-- Alerta -->
          <tr>
            <td style="padding:28px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fcd34d;border-radius:12px;padding:0;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0;font-size:14px;font-weight:700;color:#92400e;">⚠️ Seu plano vence amanhã, ${vencimento}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 32px;">
              <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
                Olá! Seu plano <strong>${planoNome}</strong> expira amanhã (<strong>${vencimento}</strong>) e o pagamento ainda não foi identificado.
              </p>
              <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.6;">
                Para não ter interrupção no acesso, você tem duas opções:
              </p>

              <!-- Opção 1: PIX -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;margin-bottom:12px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1e293b;">⚡ Opção 1 — Gerar novo link PIX</p>
                    <p style="margin:0 0 12px;font-size:13px;color:#64748b;line-height:1.5;">
                      Acesse a plataforma, vá em <em>Meu Plano</em> e gere um novo código PIX para renovar sua assinatura agora.
                    </p>
                    <a href="https://notafacilapp.com.br/plano"
                       style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 20px;border-radius:8px;">
                      Acessar Meu Plano →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Opção 2: Cartão -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;margin-bottom:20px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1e293b;">💳 Opção 2 — Cadastrar cartão de crédito</p>
                    <p style="margin:0 0 12px;font-size:13px;color:#64748b;line-height:1.5;">
                      Cadastre um cartão e não se preocupe mais com renovação — a cobrança passa a ser automática todo mês.
                    </p>
                    <a href="https://notafacilapp.com.br/plano"
                       style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 20px;border-radius:8px;">
                      Cadastrar cartão →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.5;">
                Dúvidas? Responda este e-mail ou fale com a gente em
                <a href="mailto:comercial@techlinker.com.br" style="color:#4f46e5;text-decoration:none;">comercial@techlinker.com.br</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f1f5f9;padding:16px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.5;">
                Este e-mail foi enviado para ${email} pois você possui uma assinatura ativa no NotaFacil.<br>
                Techlinker · comercial@techlinker.com.br
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
