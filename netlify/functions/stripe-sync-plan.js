// Netlify Function — sincroniza o valor da subscription Stripe com a configuração atual
// Chamada quando: A1 muda, Plano.jsx carrega, ou qualquer atualização de contrato
//
// POST { userId }
// Busca a subscription ativa do usuário, recalcula o valor (base + A1 + cupom)
// e atualiza o Price se divergir. Operação idempotente — segura chamar a qualquer hora.

const Stripe = require('stripe')

const BASE_VALUES = {
  essencial: 19700,
  pro:       29700,
}
const A1_PRICE_CENTS = 3500

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { userId } = body
  if (!userId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId é obrigatório' }) }
  }

  const SECRET_KEY   = process.env.STRIPE_SECRET_KEY
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SVC = process.env.SUPABASE_SERVICE_KEY
  const BASE_PRICES  = {
    essencial: process.env.STRIPE_PRICE_ESSENCIAL,
    pro:       process.env.STRIPE_PRICE_PRO,
  }

  if (!SECRET_KEY || !SUPABASE_URL || !SUPABASE_SVC) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Configuração incompleta' }) }
  }

  try {
    const stripe = Stripe(SECRET_KEY)

    // ── 1. Busca dados do usuário no Supabase ──────────────────────
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=stripe_subscription_id,stripe_customer_id,plano_tipo`,
      { headers: { 'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}` } }
    )
    const profRows = await profRes.json()
    const profile  = profRows?.[0]

    if (!profile?.stripe_subscription_id) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: 'Sem subscription Stripe' }) }
    }

    // ── 2. Conta contratos com A1 configurado ──────────────────────
    const a1Res = await fetch(
      `${SUPABASE_URL}/rest/v1/contratos?user_id=eq.${userId}&cert_pfx_path=not.is.null&select=id`,
      { headers: { 'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}`, 'Prefer': 'count=exact' } }
    )
    const a1Count = parseInt(a1Res.headers?.get?.('content-range')?.split('/')?.[1] || '0') || 0
    // Alternativa: contar do array
    const a1Rows = await a1Res.json()
    const a1Qty  = Array.isArray(a1Rows) ? a1Rows.length : a1Count

    // ── 3. Recupera subscription do Stripe ────────────────────────
    let sub
    try {
      sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id, {
        expand: ['items.data.price'],
      })
    } catch (err) {
      if (err.statusCode === 404) {
        // Subscription não existe mais no Stripe — limpa do Supabase
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ stripe_subscription_id: null }),
        })
        return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: 'Subscription não encontrada — removida do Supabase' }) }
      }
      throw err
    }

    if (!['active', 'trialing', 'past_due'].includes(sub.status)) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: `Status: ${sub.status}` }) }
    }

    // ── 4. Calcula valor correto ───────────────────────────────────
    const planId = sub.metadata?.plan_id || profile.plano_tipo || 'essencial'
    if (!BASE_VALUES[planId]) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: `planId inválido: ${planId}` }) }
    }

    let novoValor = BASE_VALUES[planId] + a1Qty * A1_PRICE_CENTS

    // Se há cupom registrado na subscription, usa o valor do cupom
    const cupomCodigo = sub.metadata?.cupom_codigo || ''
    if (cupomCodigo) {
      const cupomRes = await fetch(
        `${SUPABASE_URL}/rest/v1/cupons?codigo=eq.${encodeURIComponent(cupomCodigo)}&ativo=eq.true&select=valor_mensal`,
        { headers: { 'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}` } }
      )
      const cupomRows = await cupomRes.json()
      if (Array.isArray(cupomRows) && cupomRows.length > 0) {
        novoValor = Math.round(parseFloat(cupomRows[0].valor_mensal) * 100)
      }
    }

    // ── 5. Compara com valor atual ─────────────────────────────────
    const currentItem   = sub.items.data[0]
    const valorAtual    = currentItem?.price?.unit_amount || 0

    if (valorAtual === novoValor) {
      console.log('[stripe-sync-plan] Valor já correto:', novoValor, '| userId:', userId)
      return { statusCode: 200, body: JSON.stringify({ ok: true, updated: false, valor: novoValor / 100 }) }
    }

    console.log('[stripe-sync-plan] Atualizando:', valorAtual, '→', novoValor, '| a1:', a1Qty, '| cupom:', cupomCodigo || '—', '| userId:', userId)

    // ── 6. Cria novo Price e atualiza subscription ─────────────────
    // Deriva product ID (do item atual ou do Price base)
    let productId = currentItem?.price?.product
    if (typeof productId === 'object') productId = productId?.id
    if (!productId && BASE_PRICES[planId]) {
      const bp = await stripe.prices.retrieve(BASE_PRICES[planId])
      productId = typeof bp.product === 'string' ? bp.product : bp.product?.id
    }

    if (!productId) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Não foi possível determinar o produto Stripe' }) }
    }

    const newPrice = await stripe.prices.create({
      currency:    'brl',
      unit_amount: novoValor,
      recurring:   { interval: 'month' },
      product:     productId,
      metadata: {
        plan_id:      planId,
        a1_count:     String(a1Qty),
        cupom_codigo: cupomCodigo,
      },
    })

    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [{ id: currentItem.id, price: newPrice.id }],
      proration_behavior: 'none', // aplica apenas na próxima renovação, sem cobrar diferença agora
      metadata: {
        ...sub.metadata,
        a1_count:       String(a1Qty),
        valor_centavos: String(novoValor),
      },
    })

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok:           true,
        updated:      true,
        valorAnterior: valorAtual / 100,
        novoValor:    novoValor / 100,
        a1Qty,
        cupomCodigo: cupomCodigo || null,
      }),
    }

  } catch (err) {
    console.error('[stripe-sync-plan] Erro:', err.message)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
