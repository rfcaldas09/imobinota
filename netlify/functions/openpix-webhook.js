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

  // ── 2. Atualiza cobrança no Supabase → status Pago ─────────────────────────
  let supabaseResult = null
  if (SUPABASE_URL && SUPABASE_SVC_KEY && correlationID) {
    try {
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
      supabaseResult = { ok: patch.ok, status: patch.status }
    } catch (err) {
      supabaseResult = { ok: false, error: err.message }
      console.error('[openpix-webhook] Erro ao atualizar Supabase:', err.message)
    }
  } else {
    supabaseResult = { ok: false, error: 'SUPABASE_URL ou SUPABASE_SERVICE_KEY não configurados' }
    console.warn('[openpix-webhook] Supabase não configurado — cobrança NÃO atualizada no banco')
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
