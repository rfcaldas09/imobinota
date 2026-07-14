// Netlify Function — gera boleto bancário via OpenPIX (/api/v1/boleto)
// Boleto+PIX: pago pelo código de barras (agendável) OU pelo QR code PIX (instantâneo).
const FEE_CENTS = 299 // R$ 2,99 por boleto pago

exports.handler = async (event) => {
  // ── Wrapper global — captura qualquer exceção inesperada ────────
  try {
    return await handle(event)
  } catch (err) {
    console.error('[openpix-create-charge] EXCEÇÃO NÃO CAPTURADA:', err?.message, err?.stack)
    return { statusCode: 500, body: JSON.stringify({ error: `Erro interno: ${err?.message}` }) }
  }
}

async function handle(event) {
  console.log('[openpix-create-charge] method:', event.httpMethod)

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  // ── Parse do body ───────────────────────────────────────────────
  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body vazio' }) }
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido (não é JSON)' }) }
  }

  if (!body || typeof body !== 'object') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body deve ser um objeto JSON' }) }
  }

  const { value, correlationID, comment, additionalInfo, clientPixKey, dueDate, customer } = body

  console.log('[openpix-create-charge] payload:', {
    value,
    correlationID,
    hasCpf: !!customer?.taxID,
    hasPix: !!clientPixKey,
    dueDate,
  })

  // ── Validações ──────────────────────────────────────────────────
  if (!value || !correlationID) {
    return { statusCode: 400, body: JSON.stringify({ error: 'value e correlationID são obrigatórios' }) }
  }
  if (!customer || !customer.name || !customer.taxID) {
    return { statusCode: 400, body: JSON.stringify({ error: 'customer.name e customer.taxID (CPF) são obrigatórios' }) }
  }

  const APP_ID = process.env.OPENPIX_APP_ID
  if (!APP_ID) {
    console.error('[openpix-create-charge] OPENPIX_APP_ID não definido')
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENPIX_APP_ID não configurado no servidor' }) }
  }

  // ── Montagem do payload ─────────────────────────────────────────
  const splitValue = Math.max(0, Number(value) - FEE_CENTS)

  const dueDateFinal = dueDate || (() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().split('T')[0]
  })()

  const taxIDClean = String(customer.taxID).replace(/\D/g, '')

  const boletoBody = {
    value: Number(value),
    correlationID: String(correlationID),
    comment:  comment  || 'Cobrança ImobiNota',
    dueDate:  dueDateFinal,
    ...(Array.isArray(additionalInfo) && additionalInfo.length > 0 ? { additionalInfo } : {}),
    customer: {
      name:  String(customer.name),
      taxID: taxIDClean,
      ...(customer.email ? { email: String(customer.email) } : {}),
      ...(customer.phone ? { phone: String(customer.phone).replace(/\D/g, '') } : {}),
    },
    ...(clientPixKey && splitValue > 0 ? {
      splits: [{
        pixKey:    String(clientPixKey),
        value:     splitValue,
        splitType: 'SPLIT_SUB_ACCOUNT',
      }],
    } : {}),
  }

  console.log('[openpix-create-charge] boletoBody:', JSON.stringify(boletoBody))

  // ── Chamada à API OpenPIX ───────────────────────────────────────
  const res = await fetch('https://api.openpix.com.br/api/v1/boleto', {
    method: 'POST',
    headers: {
      'Authorization': APP_ID,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(boletoBody),
  })

  const rawText = await res.text()
  console.log('[openpix-create-charge] OpenPIX status:', res.status, '| body:', rawText.slice(0, 300))

  let data = {}
  try {
    data = JSON.parse(rawText)
  } catch {
    if (res.status === 404 || rawText.toLowerCase().includes('not found')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Módulo Boleto não habilitado na conta OpenPIX. Acesse: Configurações → Boleto.' }),
      }
    }
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Resposta inesperada OpenPIX (${res.status}): ${rawText.slice(0, 200)}` }),
    }
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || data?.errors?.[0]?.message || `Erro OpenPIX: ${res.status}`
    console.error('[openpix-create-charge] Erro OpenPIX:', JSON.stringify(data))
    return { statusCode: 400, body: JSON.stringify({ error: msg, detail: data }) }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok:            true,
      digitableLine: data.boleto?.digitableLine || null,
      bankSlipUrl:   data.boleto?.bankSlipUrl   || null,
      dueDate:       data.boleto?.expiresDate   || dueDateFinal,
      brCode:        data.charge?.brCode        || null,
      fee:           FEE_CENTS,
      clientSplit:   splitValue,
    }),
  }
}
