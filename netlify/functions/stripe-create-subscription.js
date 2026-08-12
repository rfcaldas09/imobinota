// Netlify Function — cria assinatura Stripe com cartão de crédito
// POST { planId, userId, userEmail, cupomCodigo? }
// Returns { clientSecret, subscriptionId, publishableKey }
//
// Variáveis de ambiente necessárias:
//   STRIPE_SECRET_KEY        — chave secreta do Stripe (sk_live_xxx ou sk_test_xxx)
//   STRIPE_PUBLISHABLE_KEY   — chave pública do Stripe (pk_live_xxx ou pk_test_xxx)
//   STRIPE_PRICE_ESSENCIAL   — Price ID do plano Essencial no Stripe (price_xxx)
//   STRIPE_PRICE_PRO         — Price ID do plano Pro no Stripe (price_xxx)
//   SUPABASE_URL             — URL do Supabase
//   SUPABASE_SERVICE_KEY     — service_role key do Supabase

const Stripe = require('stripe')

const PLANO_NOMES = {
  essencial: 'NotaFacil Essencial',
  pro:       'NotaFacil Pro',
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { planId, userId, userEmail, cupomCodigo } = body

  if (!planId || !userId || !userEmail) {
    return { statusCode: 400, body: JSON.stringify({ error: 'planId, userId e userEmail são obrigatórios' }) }
  }

  const SECRET_KEY      = process.env.STRIPE_SECRET_KEY
  const PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY
  const SUPABASE_URL    = process.env.SUPABASE_URL
  const SUPABASE_SVC    = process.env.SUPABASE_SERVICE_KEY

  const PRICES = {
    essencial: process.env.STRIPE_PRICE_ESSENCIAL,
    pro:       process.env.STRIPE_PRICE_PRO,
  }

  if (!SECRET_KEY || !PUBLISHABLE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Stripe não configurado' }) }
  }
  if (!PRICES[planId]) {
    return { statusCode: 400, body: JSON.stringify({ error: `Price ID do plano "${planId}" não configurado` }) }
  }

  try {
    const stripe = Stripe(SECRET_KEY)

    // ── 1. Valida cupom no Supabase (se informado) ─────────────────
    let stripeCouponId = null
    if (cupomCodigo && SUPABASE_URL && SUPABASE_SVC) {
      const codigoUpper = cupomCodigo.trim().toUpperCase()
      const cupomRes = await fetch(
        `${SUPABASE_URL}/rest/v1/cupons?codigo=eq.${encodeURIComponent(codigoUpper)}&ativo=eq.true&select=codigo,valor_mensal`,
        { headers: { 'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}` } }
      )
      const cupomRows = await cupomRes.json()
      if (Array.isArray(cupomRows) && cupomRows.length > 0) {
        // O ID do cupom no Stripe é o próprio código — criado antecipadamente via AdminCupons
        try {
          const existing = await stripe.coupons.retrieve(codigoUpper)
          if (existing && !existing.deleted) {
            stripeCouponId = existing.id
          }
        } catch (err) {
          if (err.statusCode === 404) {
            // Cupom ainda não foi sincronizado (pré-existente) — cria on-the-fly como fallback
            const valorOriginal = planId === 'pro' ? 29700 : 19700
            const valorDesconto = Math.round(parseFloat(cupomRows[0].valor_mensal) * 100)
            const desconto      = valorOriginal - valorDesconto
            if (desconto > 0) {
              const cupom = await stripe.coupons.create({
                id:         codigoUpper,
                name:       `NotaFacil — ${codigoUpper}`,
                amount_off: desconto,
                currency:   'brl',
                duration:   'forever',
              })
              stripeCouponId = cupom.id
            }
          } else throw err
        }
      }
    }

    // ── 2. Busca ou cria Customer Stripe ───────────────────────────
    let stripeCustomerId = null

    if (SUPABASE_URL && SUPABASE_SVC) {
      const profRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id`,
        { headers: { 'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}` } }
      )
      const profRows = await profRes.json()
      stripeCustomerId = profRows?.[0]?.stripe_customer_id || null
    }

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { supabase_user_id: userId },
      })
      stripeCustomerId = customer.id

      // Salva no Supabase
      if (SUPABASE_URL && SUPABASE_SVC) {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ stripe_customer_id: stripeCustomerId }),
        })
      }
    }

    // ── 3. Verifica se já há assinatura ativa para este plano ──────
    const existingSubs = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      price:    PRICES[planId],
      status:   'active',
      limit:    1,
    })
    if (existingSubs.data.length > 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok:             true,
          alreadyActive:  true,
          subscriptionId: existingSubs.data[0].id,
          publishableKey: PUBLISHABLE_KEY,
        }),
      }
    }

    // ── 4. Cria assinatura (incomplete → usuário paga agora) ───────
    const subParams = {
      customer:         stripeCustomerId,
      items:            [{ price: PRICES[planId] }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand:           ['latest_invoice.payment_intent'],
      metadata:         { supabase_user_id: userId, plan_id: planId },
    }
    if (stripeCouponId) subParams.coupon = stripeCouponId

    const subscription = await stripe.subscriptions.create(subParams)
    const paymentIntent = subscription.latest_invoice.payment_intent

    console.log('[stripe-create-subscription] Sub criada:', subscription.id, '| planId:', planId, '| userId:', userId)

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok:             true,
        clientSecret:   paymentIntent.client_secret,
        subscriptionId: subscription.id,
        publishableKey: PUBLISHABLE_KEY,
      }),
    }
  } catch (err) {
    console.error('[stripe-create-subscription] Erro:', err.message)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
