// Netlify Function — gera cobrança PIX para pagamento de plano NotaFacil
// Sem split (100% para a conta principal OpenPIX).
// correlationID: "plano-{userId}-{planId}-{YYYYMM}" — evita duplicatas no mesmo mês.

const PLANOS = {
  essencial: { nome: 'NotaFacil Essencial', valor: 19700 }, // R$ 197,00 em centavos
  pro:       { nome: 'NotaFacil Pro',       valor: 29700 }, // R$ 297,00
}

exports.handler = async (event) => {
  try {
    return await handle(event)
  } catch (err) {
    console.error('[plano-pagar] Exceção:', err?.message)
    return { statusCode: 500, body: JSON.stringify({ error: `Erro interno: ${err?.message}` }) }
  }
}

async function handle(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { planId, userId } = body
  if (!planId || !userId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'planId e userId são obrigatórios' }) }
  }

  const plano = PLANOS[planId]
  if (!plano) {
    return { statusCode: 400, body: JSON.stringify({ error: `Plano inválido: ${planId}` }) }
  }

  const APP_ID = process.env.OPENPIX_APP_ID
  if (!APP_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENPIX_APP_ID não configurado' }) }
  }

  // correlationID único por usuário + plano + mês (evita cobrar duas vezes no mês)
  const now = new Date()
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const correlationID = `plano-${userId}-${planId}-${yyyymm}`

  // QR expira no último dia do mês atual às 23:59
  const ultimoDia = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const expiresIn = Math.max(3600, Math.floor((ultimoDia - now) / 1000))

  const chargeBody = {
    value:         plano.valor,
    correlationID,
    comment:       `Assinatura ${plano.nome} - ${yyyymm.slice(0, 4)}/${yyyymm.slice(4)}`,
    expiresIn,
  }

  console.log('[plano-pagar] payload:', JSON.stringify(chargeBody))

  const res = await fetch('https://api.openpix.com.br/api/v1/charge', {
    method: 'POST',
    headers: { 'Authorization': APP_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify(chargeBody),
  })

  const rawText = await res.text()
  console.log('[plano-pagar] OpenPIX status:', res.status, '| body:', rawText.slice(0, 300))

  let data = {}
  try { data = JSON.parse(rawText) } catch {
    return { statusCode: 400, body: JSON.stringify({ error: `Resposta inesperada (${res.status})` }) }
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || data?.errors?.[0]?.message || `Erro OpenPIX: ${res.status}`

    // Se já existe cobrança para este mês, busca e retorna a existente
    const isDuplicate = /correlat|j.{1,4}existe|already exist/i.test(msg)
    if (isDuplicate) {
      const getRes = await fetch(`https://api.openpix.com.br/api/v1/charge/${correlationID}`, {
        headers: { 'Authorization': APP_ID },
      })
      if (getRes.ok) {
        const existing = await getRes.json()
        const ch = existing.charge || existing
        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true,
            brCode:     existing.brCode || ch.brCode || null,
            amount:     ch.value || plano.valor,
            planName:   plano.nome,
            correlationID,
            existing:   true,
          }),
        }
      }
    }

    return { statusCode: 400, body: JSON.stringify({ error: msg }) }
  }

  const charge = data.charge || data
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      brCode:       data.brCode || charge.brCode || null,
      amount:       charge.value || plano.valor,
      planName:     plano.nome,
      correlationID,
    }),
  }
}
