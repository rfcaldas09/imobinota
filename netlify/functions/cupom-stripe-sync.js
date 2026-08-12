// Netlify Function — sincroniza cupons do sistema com o Stripe
// POST { action: 'create' | 'delete', codigo, valorMensal }
//
// 'create': cria coupon no Stripe com ID = codigo e amount_off calculado
// 'delete': arquiva o coupon no Stripe (stripe.coupons.del)
//
// O amount_off é calculado como: precoBase - valorMensal (em centavos)
// precoBase = env STRIPE_ESSENCIAL_BASE_CENTS (default: 19700 = R$197)
//
// Variáveis de ambiente:
//   STRIPE_SECRET_KEY
//   STRIPE_ESSENCIAL_BASE_CENTS  (opcional, default 19700)

const Stripe = require('stripe')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { action, codigo, valorMensal } = body

  if (!action || !codigo) {
    return { statusCode: 400, body: JSON.stringify({ error: 'action e codigo são obrigatórios' }) }
  }

  const SECRET_KEY = process.env.STRIPE_SECRET_KEY
  if (!SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Stripe não configurado' }) }
  }

  const stripe = Stripe(SECRET_KEY)
  const codigoUpper = codigo.trim().toUpperCase()

  // ── CREATE ──────────────────────────────────────────────────────
  if (action === 'create') {
    if (!valorMensal) {
      return { statusCode: 400, body: JSON.stringify({ error: 'valorMensal é obrigatório para create' }) }
    }

    // Verifica se já existe no Stripe (idempotente)
    try {
      const existing = await stripe.coupons.retrieve(codigoUpper)
      if (existing && !existing.deleted) {
        console.log('[cupom-stripe-sync] Cupom já existe no Stripe:', codigoUpper)
        return { statusCode: 200, body: JSON.stringify({ ok: true, couponId: existing.id, alreadyExisted: true }) }
      }
    } catch (err) {
      if (err.statusCode !== 404) throw err
      // 404 = não existe, segue para criar
    }

    // Calcula amount_off: precoBase - valorMensal (em centavos)
    const baseCents   = parseInt(process.env.STRIPE_ESSENCIAL_BASE_CENTS || '19700', 10)
    const finalCents  = Math.round(parseFloat(valorMensal) * 100)
    const amountOff   = baseCents - finalCents

    if (amountOff <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Valor do cupom (R$${valorMensal}) é maior ou igual ao preço base (R$${baseCents / 100}). Desconto inválido.` }),
      }
    }

    const coupon = await stripe.coupons.create({
      id:         codigoUpper,   // ID = nosso código — reutilizável por qualquer assinatura
      name:       `NotaFacil — ${codigoUpper}`,
      amount_off: amountOff,
      currency:   'brl',
      duration:   'forever',
    })

    console.log('[cupom-stripe-sync] Cupom criado no Stripe:', coupon.id, '| amount_off:', amountOff)
    return { statusCode: 200, body: JSON.stringify({ ok: true, couponId: coupon.id, amountOff }) }
  }

  // ── DELETE ──────────────────────────────────────────────────────
  if (action === 'delete') {
    try {
      await stripe.coupons.del(codigoUpper)
      console.log('[cupom-stripe-sync] Cupom deletado no Stripe:', codigoUpper)
    } catch (err) {
      if (err.statusCode === 404) {
        // Já não existe — sem problema
        console.log('[cupom-stripe-sync] Cupom não encontrado no Stripe (já deletado):', codigoUpper)
      } else {
        console.error('[cupom-stripe-sync] Erro ao deletar cupom:', err.message)
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
      }
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  }

  // ── RECREATE (reativar) ─────────────────────────────────────────
  if (action === 'recreate') {
    if (!valorMensal) {
      return { statusCode: 400, body: JSON.stringify({ error: 'valorMensal é obrigatório para recreate' }) }
    }

    // Deleta o existente se houver (Stripe não permite editar amount_off)
    try { await stripe.coupons.del(codigoUpper) } catch {}

    const baseCents  = parseInt(process.env.STRIPE_ESSENCIAL_BASE_CENTS || '19700', 10)
    const finalCents = Math.round(parseFloat(valorMensal) * 100)
    const amountOff  = baseCents - finalCents

    if (amountOff <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Desconto inválido' }) }
    }

    const coupon = await stripe.coupons.create({
      id:         codigoUpper,
      name:       `NotaFacil — ${codigoUpper}`,
      amount_off: amountOff,
      currency:   'brl',
      duration:   'forever',
    })

    console.log('[cupom-stripe-sync] Cupom recriado no Stripe:', coupon.id)
    return { statusCode: 200, body: JSON.stringify({ ok: true, couponId: coupon.id }) }
  }

  return { statusCode: 400, body: JSON.stringify({ error: `Action desconhecida: ${action}` }) }
}
