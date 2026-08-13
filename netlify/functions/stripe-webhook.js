// Netlify Function — webhook do Stripe
// Recebe eventos de pagamento de assinaturas e atualiza o Supabase
//
// ⚠️  Configure no painel Stripe:
//      Developers → Webhooks → Add endpoint
//      URL: https://SEU_DOMINIO.netlify.app/.netlify/functions/stripe-webhook
//      Eventos: invoice.paid, invoice.payment_failed, customer.subscription.deleted
//
// ⚠️  Variáveis de ambiente necessárias:
//      STRIPE_SECRET_KEY      — chave secreta do Stripe
//      STRIPE_WEBHOOK_SECRET  — webhook signing secret (whsec_xxx do painel Stripe)
//      SUPABASE_URL
//      SUPABASE_SERVICE_KEY

const Stripe = require('stripe')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  }

  const SECRET_KEY      = process.env.STRIPE_SECRET_KEY
  const WEBHOOK_SECRET  = process.env.STRIPE_WEBHOOK_SECRET
  const SUPABASE_URL    = process.env.SUPABASE_URL
  const SUPABASE_SVC    = process.env.SUPABASE_SERVICE_KEY

  if (!SECRET_KEY || !WEBHOOK_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Stripe não configurado' }) }
  }

  const stripe = Stripe(SECRET_KEY)

  // ── Verifica assinatura do webhook ─────────────────────────────
  let stripeEvent
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      event.headers['stripe-signature'],
      WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('[stripe-webhook] Assinatura inválida:', err.message)
    return { statusCode: 400, body: `Webhook Error: ${err.message}` }
  }

  console.log('[stripe-webhook] Evento recebido:', stripeEvent.type)

  // ── Helpers Supabase ───────────────────────────────────────────
  const sbPatch = async (table, filter, data) => {
    if (!SUPABASE_URL || !SUPABASE_SVC) return
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify(data),
    })
  }

  const getUserIdByCustomer = async (customerId) => {
    if (!SUPABASE_URL || !SUPABASE_SVC) return null
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?stripe_customer_id=eq.${customerId}&select=id`,
      { headers: { 'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}` } }
    )
    const rows = await res.json()
    return rows?.[0]?.id || null
  }

  // ── Incrementa cupom (se houver no metadata da sub) ────────────
  const incrementarCupomStripe = async (subscriptionId) => {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId)
      const cupomCodigo = sub.metadata?.cupom_codigo
      if (!cupomCodigo || !SUPABASE_URL || !SUPABASE_SVC) return

      const cupomRes = await fetch(
        `${SUPABASE_URL}/rest/v1/cupons?codigo=eq.${encodeURIComponent(cupomCodigo)}&select=id,usos`,
        { headers: { 'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}` } }
      )
      const cupomRows = await cupomRes.json()
      if (Array.isArray(cupomRows) && cupomRows.length > 0) {
        const c = cupomRows[0]
        await sbPatch('cupons', `id=eq.${c.id}`, { usos: (c.usos || 0) + 1 })
      }
    } catch (err) {
      console.error('[stripe-webhook] Erro ao incrementar cupom:', err.message)
    }
  }

  // ── Trata eventos ──────────────────────────────────────────────
  try {
    switch (stripeEvent.type) {

      case 'invoice.paid': {
        // Pagamento confirmado — ativa/renova plano por 35 dias (margem para ciclo mensal)
        const invoice = stripeEvent.data.object

        // Log completo para debug (API version 2026-07-29.dahlia mudou campos do invoice)
        console.log('[stripe-webhook] invoice.paid campos:', JSON.stringify({
          id:                   invoice.id,
          customer:             invoice.customer,
          subscription:         invoice.subscription,
          subscription_details: invoice.subscription_details,
          parent:               invoice.parent,
          billing_reason:       invoice.billing_reason,
          status:               invoice.status,
        }))

        const customerId = invoice.customer

        // Na API 2026-07-29.dahlia, o subscription ID migrou para invoice.parent
        const subscriptionId =
          invoice.subscription ||
          invoice.subscription_details?.subscription ||
          invoice.parent?.subscription_details?.subscription

        if (!subscriptionId) {
          console.log('[stripe-webhook] invoice.paid sem subscriptionId — ignorando (invoice avulsa)')
          break
        }

        const sub = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ['items.data.price'],
        })

        // Deriva planId a partir do price.id da assinatura (mais confiável que metadata)
        const PRICES = {
          essencial: process.env.STRIPE_PRICE_ESSENCIAL,
          pro:       process.env.STRIPE_PRICE_PRO,
        }
        const subPriceId = sub.items?.data?.[0]?.price?.id
        let planId = sub.metadata?.plan_id  // tenta metadata primeiro
        if (!planId || !['essencial', 'pro'].includes(planId)) {
          // Deriva pelo price ID — fonte mais confiável
          if (subPriceId === PRICES.pro)       planId = 'pro'
          else if (subPriceId === PRICES.essencial) planId = 'essencial'
          else planId = 'essencial' // fallback
        }

        console.log('[stripe-webhook] planId derivado:', { planId, subPriceId, metadataPlanId: sub.metadata?.plan_id })

        const userId = sub.metadata?.supabase_user_id || await getUserIdByCustomer(customerId)

        if (!userId) {
          console.error('[stripe-webhook] userId não encontrado para customer:', customerId)
          break
        }

        const fim = new Date()
        fim.setDate(fim.getDate() + 35) // 35d de margem para o ciclo mensal

        await sbPatch('profiles', `id=eq.${userId}`, {
          plano_tipo:             planId,
          plano_fim:              fim.toISOString(),
          plano_inicio:           new Date().toISOString(),
          stripe_subscription_id: subscriptionId,
        })

        // Incrementa uso do cupom apenas na primeira invoice (billing_reason = subscription_create)
        if (invoice.billing_reason === 'subscription_create') {
          await incrementarCupomStripe(subscriptionId)
        }

        console.log('[stripe-webhook] Plano ativado:', { userId, planId, fim })
        break
      }

      case 'invoice.payment_failed': {
        // Pagamento falhou — Stripe vai tentar de novo automaticamente
        // Aqui apenas logamos; poderíamos enviar um e-mail de aviso
        const invoice    = stripeEvent.data.object
        const customerId = invoice.customer
        const userId     = await getUserIdByCustomer(customerId)
        console.warn('[stripe-webhook] Pagamento falhou:', { customerId, userId, invoiceId: invoice.id })
        // TODO: enviar e-mail de aviso para o cliente
        break
      }

      case 'customer.subscription.deleted': {
        // Assinatura cancelada/expirada — suspende acesso
        const sub    = stripeEvent.data.object
        const userId = sub.metadata?.supabase_user_id || await getUserIdByCustomer(sub.customer)

        if (userId) {
          await sbPatch('profiles', `id=eq.${userId}`, {
            plano_tipo:             null,
            plano_fim:              new Date().toISOString(), // expira imediatamente
            stripe_subscription_id: null,
          })
          console.log('[stripe-webhook] Assinatura cancelada, acesso suspenso:', userId)
        }
        break
      }

      default:
        console.log('[stripe-webhook] Evento ignorado:', stripeEvent.type)
    }
  } catch (err) {
    console.error('[stripe-webhook] Erro ao processar evento:', stripeEvent.type, err.message)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) }
}
