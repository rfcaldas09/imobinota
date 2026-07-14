// Netlify Function — webhook do OpenPIX
// Recebe notificações de pagamento e dispara saque automático para a chave PIX do cliente
//
// ⚠️  Configure no painel OpenPIX:
//      Configurações → Webhook → URL: https://SEU_DOMINIO.netlify.app/.netlify/functions/openpix-webhook
//
// Eventos tratados:
//   OPENPIX:CHARGE_COMPLETED  → pagamento confirmado → saca subconta para PIX do cliente
exports.handler = async (event) => {
  // OpenPIX envia GET para validar o endpoint ao criar o webhook — responde 200
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  }

  const APP_ID = process.env.OPENPIX_APP_ID
  if (!APP_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENPIX_APP_ID não configurado' }) }
  }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, body: 'Body inválido' }
  }

  const eventType = body?.event
  const charge    = body?.charge

  // Responde OK imediatamente para outros eventos (OpenPIX exige 2xx rápido)
  if (eventType !== 'OPENPIX:CHARGE_COMPLETED') {
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, event: eventType }) }
  }

  // Extrai as subcontas que devem receber o split
  const splits = charge?.splits || []
  const subAccountSplits = splits.filter(s => s.splitType === 'SPLIT_SUB_ACCOUNT' && s.pixKey)

  const results = []

  for (const split of subAccountSplits) {
    try {
      // Saca o saldo integral da subconta para a chave PIX do cliente
      const withdrawRes = await fetch(
        `https://api.openpix.com.br/api/v1/subaccount/${encodeURIComponent(split.pixKey)}/withdraw`,
        {
          method: 'POST',
          headers: {
            'Authorization': APP_ID,
            'Content-Type': 'application/json',
          },
        }
      )

      const withdrawData = await withdrawRes.json()

      results.push({
        pixKey: split.pixKey,
        ok: withdrawRes.ok,
        status: withdrawData?.transaction?.status || null,
        error: withdrawRes.ok ? null : (withdrawData?.error || `HTTP ${withdrawRes.status}`),
      })
    } catch (err) {
      results.push({ pixKey: split.pixKey, ok: false, error: err.message })
    }
  }

  console.log('[openpix-webhook] CHARGE_COMPLETED', {
    correlationID: charge?.correlationID,
    value: charge?.value,
    withdrawResults: results,
  })

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, withdrawResults: results }),
  }
}
