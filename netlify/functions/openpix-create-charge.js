// Netlify Function — gera cobrança PIX via OpenPIX (/api/v1/charge)
// O QR code fica válido até a data de vencimento + 3 dias de carência.
// A maioria dos bancos (Itaú, Bradesco, Nubank, C6, etc.) permite agendar o
// pagamento ao ler um QR code com vencimento futuro.
const FEE_CENTS = 299 // R$ 2,99 por cobrança paga

exports.handler = async (event) => {
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

  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body vazio' }) }
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido (não é JSON)' }) }
  }

  if (!body || typeof body !== 'object') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body deve ser um objeto JSON' }) }
  }

  const {
    value,          // centavos — ex: 164390 = R$1.643,90
    correlationID,  // UUID da cobrança no Supabase
    comment,        // descrição curta (aparece no extrato do pagador)
    additionalInfo, // [{ key, value }] — itens discriminados exibidos no app
    clientPixKey,   // chave PIX do cliente para split (subconta OpenPIX)
    expiresIn,      // segundos até expirar (calculado no frontend)
  } = body

  console.log('[openpix-create-charge] payload:', { value, correlationID, hasPix: !!clientPixKey, expiresIn })

  if (!value || !correlationID) {
    return { statusCode: 400, body: JSON.stringify({ error: 'value e correlationID são obrigatórios' }) }
  }

  const APP_ID = process.env.OPENPIX_APP_ID
  if (!APP_ID) {
    console.error('[openpix-create-charge] OPENPIX_APP_ID não definido')
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENPIX_APP_ID não configurado no servidor' }) }
  }

  // Taxa exata da OpenPIX: 0,80% por PIX recebido, mín R$0,50 (50 cents), máx R$5,00 (500 cents).
  // O split precisa ser < value - taxa_openpix, então descontamos os dois valores separadamente.
  // NotaFacil fica com R$2,99; OpenPIX fica com a taxa deles; cliente fica com o restante.
  const openPixFee = Math.min(Math.max(Math.round(Number(value) * 0.008), 50), 500)
  const splitValue = Math.max(0, Number(value) - FEE_CENTS - openPixFee)

  const chargeBody = {
    value:         Number(value),
    correlationID: String(correlationID),
    comment:       (comment || 'Cobranca NotaFacil').replace(/[^\x00-\x7F]/g, ''),
    expiresIn:     Number(expiresIn) || 30 * 24 * 3600, // padrão 30 dias
    ...(Array.isArray(additionalInfo) && additionalInfo.length > 0 ? { additionalInfo } : {}),
    ...(clientPixKey && splitValue > 0 ? {
      splits: [{
        pixKey:    String(clientPixKey),
        value:     splitValue,
        splitType: 'SPLIT_SUB_ACCOUNT',
      }],
    } : {}),
  }

  console.log('[openpix-create-charge] chargeBody:', JSON.stringify(chargeBody))

  const res = await fetch('https://api.openpix.com.br/api/v1/charge', {
    method: 'POST',
    headers: {
      'Authorization': APP_ID,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(chargeBody),
  })

  const rawText = await res.text()
  console.log('[openpix-create-charge] OpenPIX status:', res.status, '| body:', rawText.slice(0, 300))

  let data = {}
  try {
    data = JSON.parse(rawText)
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Resposta inesperada OpenPIX (${res.status}): ${rawText.slice(0, 200)}` }),
    }
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || data?.errors?.[0]?.message || `Erro OpenPIX: ${res.status}`

    // Se a cobrança já existe com este correlationID, busca e retorna a existente
    const isDuplicate = /correlat|j.{1,4}existe|already exist/i.test(msg)
    if (isDuplicate) {
      console.log('[openpix-create-charge] Cobrança duplicada — buscando existente:', correlationID)
      try {
        const getRes = await fetch(`https://api.openpix.com.br/api/v1/charge/${correlationID}`, {
          headers: { 'Authorization': APP_ID },
        })
        if (getRes.ok) {
          const existingData = await getRes.json()
          const existingCharge = existingData.charge || existingData
          console.log('[openpix-create-charge] Cobrança existente encontrada:', existingCharge?.correlationID)
          return {
            statusCode: 200,
            body: JSON.stringify({
              ok:          true,
              brCode:      existingData.brCode || existingCharge.brCode || null,
              pixQrCode:   existingCharge.pixQrCode || null,
              expiresAt:   existingCharge.expiresIn
                             ? new Date(Date.now() + existingCharge.expiresIn * 1000).toISOString()
                             : null,
              fee:         FEE_CENTS,
              clientSplit: Math.max(0, Number(existingCharge.value) - FEE_CENTS),
              existing:    true, // flag para o frontend saber que é uma cobrança já gerada
            }),
          }
        }
      } catch (fetchErr) {
        console.warn('[openpix-create-charge] Falha ao buscar cobrança existente:', fetchErr.message)
      }
    }

    console.error('[openpix-create-charge] Erro OpenPIX:', JSON.stringify(data))
    return { statusCode: 400, body: JSON.stringify({ error: msg, detail: data }) }
  }

  const charge = data.charge || data

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok:          true,
      brCode:      data.brCode || charge.brCode       || null, // PIX copia-e-cola
      pixQrCode:   charge.pixQrCode                   || null, // URL do QR code (se disponível)
      expiresAt:   charge.expiresIn
                     ? new Date(Date.now() + charge.expiresIn * 1000).toISOString()
                     : null,
      fee:         FEE_CENTS,
      clientSplit: splitValue,
    }),
  }
}
