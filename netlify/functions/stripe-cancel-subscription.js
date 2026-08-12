// Netlify Function — cancela assinatura Stripe no fim do período vigente
// POST { userId, subscriptionId }
// O acesso continua até o fim do mês já pago; depois o webhook desativa.

const Stripe = require('stripe')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { userId, subscriptionId } = body
  if (!userId || !subscriptionId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId e subscriptionId são obrigatórios' }) }
  }

  const SECRET_KEY   = process.env.STRIPE_SECRET_KEY
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SVC = process.env.SUPABASE_SERVICE_KEY

  if (!SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Stripe não configurado' }) }
  }

  try {
    const stripe = Stripe(SECRET_KEY)

    // ── Verifica que a assinatura pertence a este usuário ──────────
    const sub = await stripe.subscriptions.retrieve(subscriptionId)
    const ownerUserId = sub.metadata?.supabase_user_id

    // Fallback: verifica via customer no Supabase
    if (ownerUserId !== userId) {
      if (SUPABASE_URL && SUPABASE_SVC) {
        const profRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id`,
          { headers: { 'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}` } }
        )
        const profRows = await profRes.json()
        const stripeCustomerId = profRows?.[0]?.stripe_customer_id
        if (sub.customer !== stripeCustomerId) {
          return { statusCode: 403, body: JSON.stringify({ error: 'Assinatura não pertence a este usuário' }) }
        }
      } else {
        return { statusCode: 403, body: JSON.stringify({ error: 'Não foi possível verificar o proprietário da assinatura' }) }
      }
    }

    // ── Cancela no fim do período (não cobra mais, acesso continua até lá) ─
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })

    const cancelAt = updated.cancel_at
      ? new Date(updated.cancel_at * 1000).toISOString()
      : null

    console.log('[stripe-cancel-subscription] Cancelada ao fim do período:', { userId, subscriptionId, cancelAt })

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, cancelAt }),
    }
  } catch (err) {
    console.error('[stripe-cancel-subscription] Erro:', err.message)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
