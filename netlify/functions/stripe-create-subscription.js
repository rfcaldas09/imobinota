// Netlify Function — cria assinatura Stripe com cartão de crédito
// POST { planId, userId, userEmail, cupomCodigo?, a1Count? }
//
// Usa DYNAMIC PRICING: cria um Stripe Price com o valor exato para cada subscription.
// Isso garante que renovações cobrem sempre o valor correto (com cupom e A1 inclusos).
//
// Variáveis de ambiente necessárias:
//   STRIPE_SECRET_KEY        — chave secreta do Stripe (sk_live_xxx ou sk_test_xxx)
//   STRIPE_PUBLISHABLE_KEY   — chave pública do Stripe (pk_live_xxx ou pk_test_xxx)
//   STRIPE_PRICE_ESSENCIAL   — Price ID base do plano Essencial (usado apenas para derivar o Product ID)
//   STRIPE_PRICE_PRO         — Price ID base do plano Pro
//   SUPABASE_URL             — URL do Supabase
//   SUPABASE_SERVICE_KEY     — service_role key do Supabase

const Stripe = require('stripe')

const BASE_VALUES = {
  essencial: 19700, // R$ 197,00 em centavos
  pro:       29700, // R$ 297,00
}
const A1_PRICE_CENTS = 3500 // R$ 35,00 por certificado A1

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { planId, userId, userEmail, cupomCodigo, a1Count } = body

  if (!planId || !userId || !userEmail) {
    return { statusCode: 400, body: JSON.stringify({ error: 'planId, userId e userEmail são obrigatórios' }) }
  }
  if (!BASE_VALUES[planId]) {
    return { statusCode: 400, body: JSON.stringify({ error: `Plano inválido: ${planId}` }) }
  }

  const SECRET_KEY      = process.env.STRIPE_SECRET_KEY
  const PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY
  const SUPABASE_URL    = process.env.SUPABASE_URL
  const SUPABASE_SVC    = process.env.SUPABASE_SERVICE_KEY

  const BASE_PRICES = {
    essencial: process.env.STRIPE_PRICE_ESSENCIAL,
    pro:       process.env.STRIPE_PRICE_PRO,
  }

  if (!SECRET_KEY || !PUBLISHABLE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Stripe não configurado' }) }
  }
  if (!BASE_PRICES[planId]) {
    return { statusCode: 400, body: JSON.stringify({ error: `STRIPE_PRICE_${planId.toUpperCase()} não configurado` }) }
  }

  try {
    const stripe = Stripe(SECRET_KEY)
    const a1Qty  = Math.max(0, parseInt(a1Count) || 0)

    // ── 1. Calcula valor exato (base + A1) ─────────────────────────
    let valorCentavos = BASE_VALUES[planId] + a1Qty * A1_PRICE_CENTS
    let cupomAplicado = null

    if (cupomCodigo && SUPABASE_URL && SUPABASE_SVC) {
      const codigoUpper = cupomCodigo.trim().toUpperCase()
      const cupomRes = await fetch(
        `${SUPABASE_URL}/rest/v1/cupons?codigo=eq.${encodeURIComponent(codigoUpper)}&ativo=eq.true&select=codigo,valor_mensal`,
        { headers: { 'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}` } }
      )
      const cupomRows = await cupomRes.json()
      if (Array.isArray(cupomRows) && cupomRows.length > 0) {
        // Cupom substitui o valor total (sem somar A1 — cupom é um acordo fixo)
        valorCentavos = Math.round(parseFloat(cupomRows[0].valor_mensal) * 100)
        cupomAplicado = codigoUpper
        console.log('[stripe-create-subscription] Cupom aplicado:', codigoUpper, '→ R$', cupomRows[0].valor_mensal)
      } else {
        return { statusCode: 400, body: JSON.stringify({ error: 'Cupom inválido ou inativo' }) }
      }
    }

    // ── 2. Derivar Product ID do Price base (sem precisar de nova env var) ──
    const basePrice = await stripe.prices.retrieve(BASE_PRICES[planId])
    const productId = typeof basePrice.product === 'string' ? basePrice.product : basePrice.product.id

    // ── 3. Criar Price dinâmico com o valor exato ──────────────────
    const dynamicPrice = await stripe.prices.create({
      currency:    'brl',
      unit_amount: valorCentavos,
      recurring:   { interval: 'month' },
      product:     productId,
      metadata: {
        plan_id:      planId,
        a1_count:     String(a1Qty),
        cupom_codigo: cupomAplicado || '',
        valor_base:   String(BASE_VALUES[planId]),
      },
    })

    console.log('[stripe-create-subscription] Price criado:', dynamicPrice.id, '| valor:', valorCentavos, '| a1:', a1Qty, '| cupom:', cupomAplicado || '—')

    // ── 4. Busca ou cria Customer Stripe ───────────────────────────
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

    // ── 5. Verifica se já há assinatura ativa (por metadata.plan_id) ─
    const allSubs = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status:   'active',
      limit:    10,
    })
    const existingSub = allSubs.data.find(s => s.metadata?.plan_id === planId)
    if (existingSub) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok:             true,
          alreadyActive:  true,
          subscriptionId: existingSub.id,
          publishableKey: PUBLISHABLE_KEY,
        }),
      }
    }

    // ── 6. Cria assinatura com o Price dinâmico ────────────────────
    const subscription = await stripe.subscriptions.create({
      customer:         stripeCustomerId,
      items:            [{ price: dynamicPrice.id }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand:           ['latest_invoice.payment_intent'],
      metadata: {
        supabase_user_id: userId,
        plan_id:          planId,
        a1_count:         String(a1Qty),
        cupom_codigo:     cupomAplicado || '',
        valor_centavos:   String(valorCentavos),
      },
    })

    const paymentIntent = subscription.latest_invoice.payment_intent
    console.log('[stripe-create-subscription] Sub criada:', subscription.id, '| valor:', valorCentavos, '| userId:', userId)

    // Incrementa cupom ao criar (primeiro pagamento)
    if (cupomAplicado && SUPABASE_URL && SUPABASE_SVC) {
      try {
        const cupomRes = await fetch(
          `${SUPABASE_URL}/rest/v1/cupons?codigo=eq.${encodeURIComponent(cupomAplicado)}&select=id,usos`,
          { headers: { 'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}` } }
        )
        const rows = await cupomRes.json()
        if (Array.isArray(rows) && rows.length > 0) {
          await fetch(`${SUPABASE_URL}/rest/v1/cupons?id=eq.${rows[0].id}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ usos: (rows[0].usos || 0) + 1 }),
          })
        }
      } catch (err) {
        console.warn('[stripe-create-subscription] Erro ao incrementar cupom:', err.message)
      }
    }

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
