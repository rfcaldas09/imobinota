// Netlify Function — webhook do OpenPIX
// Recebe notificações de pagamento, dispara saque automático para a chave PIX do cliente
// e atualiza o status da cobrança no Supabase para "Pago"
//
// ⚠️  Configure no painel OpenPIX:
//      Configurações → Webhook → URL: https://SEU_DOMINIO.netlify.app/.netlify/functions/openpix-webhook
//
// ⚠️  Variáveis de ambiente necessárias (Netlify + .env):
//      OPENPIX_APP_ID      — token do operador OpenPIX
//      SUPABASE_URL        — ex: https://xxxxxxxxxxx.supabase.co
//      SUPABASE_SERVICE_KEY — service_role key (bypassa RLS)
//
// Eventos tratados:
//   OPENPIX:CHARGE_COMPLETED  → pagamento confirmado → saca subconta → marca cobrança como Pago
exports.handler = async (event) => {
  // OpenPIX envia GET para validar o endpoint ao criar o webhook — responde 200
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  }

  const APP_ID           = process.env.OPENPIX_APP_ID
  const SUPABASE_URL     = process.env.SUPABASE_URL
  const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_KEY

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

  const correlationID = charge?.correlationID
  const results = []

  // ── 1. Saque automático para as subcontas no split ──────────────────────────
  const splits = charge?.splits || []
  const subAccountSplits = splits.filter(s => s.splitType === 'SPLIT_SUB_ACCOUNT' && s.pixKey)

  for (const split of subAccountSplits) {
    try {
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

  // ── 2. Detecta se é pagamento de PLANO ou de COBRANÇA de aluguel ──────────────
  // correlationID de plano: "plano-{userId}-{planId}-{YYYYMM}"
  const isPlanPayment = correlationID && /^plano-/.test(correlationID)

  let supabaseResult = null
  if (SUPABASE_URL && SUPABASE_SVC_KEY && correlationID) {
    try {
      if (isPlanPayment) {
        // ── Ativa assinatura do usuário ──────────────────────────────
        // correlationID: plano-{userId}-{planId}-YYYYMM
        const parts  = correlationID.split('-') // ['plano', userId, planId, YYYYMM]
        const userId = parts[1]
        const planId = parts[2]
        const fim    = new Date()
        fim.setDate(fim.getDate() + 30) // 30 dias a partir do pagamento

        const patch = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
          {
            method: 'PATCH',
            headers: {
              'apikey':        SUPABASE_SVC_KEY,
              'Authorization': `Bearer ${SUPABASE_SVC_KEY}`,
              'Content-Type':  'application/json',
              'Prefer':        'return=minimal',
            },
            body: JSON.stringify({
              plano_tipo:    planId,
              plano_fim:     fim.toISOString(),
              plano_inicio:  new Date().toISOString(),
            }),
          }
        )
        supabaseResult = { ok: patch.ok, status: patch.status, type: 'plano', planId, userId }
        console.log('[openpix-webhook] Plano ativado:', { userId, planId, fim })
      } else {
        // ── Marca cobrança de aluguel como Pago ──────────────────────
        const patch = await fetch(
          `${SUPABASE_URL}/rest/v1/cobrancas?id=eq.${correlationID}`,
          {
            method: 'PATCH',
            headers: {
              'apikey':        SUPABASE_SVC_KEY,
              'Authorization': `Bearer ${SUPABASE_SVC_KEY}`,
              'Content-Type':  'application/json',
              'Prefer':        'return=minimal',
            },
            body: JSON.stringify({
              status:         'Pago',
              data_pagamento: new Date().toISOString(),
            }),
          }
        )
        supabaseResult = { ok: patch.ok, status: patch.status, type: 'cobranca' }
      }
    } catch (err) {
      supabaseResult = { ok: false, error: err.message }
      console.error('[openpix-webhook] Erro ao atualizar Supabase:', err.message)
    }
  } else {
    supabaseResult = { ok: false, error: 'SUPABASE_URL ou SUPABASE_SERVICE_KEY nao configurados' }
    console.warn('[openpix-webhook] Supabase nao configurado')
  }

  console.log('[openpix-webhook] CHARGE_COMPLETED processado', {
    correlationID,
    value: charge?.value,
    withdrawResults: results,
    supabaseResult,
  })

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, withdrawResults: results, supabaseResult }),
  }
}
