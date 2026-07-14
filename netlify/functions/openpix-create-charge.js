// Netlify Function — cria uma cobrança PIX+Boleto no OpenPIX com split para subconta do cliente
// O valor da taxa (R$2,99) fica na conta principal (TechLinker)
// O restante vai para a subconta do cliente e é sacado automaticamente via webhook
const FEE_CENTS = 299 // R$ 2,99 por boleto pago

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const {
    value,          // valor em centavos (ex: 150000 = R$1.500,00)
    correlationID,  // ID único da cobrança (ex: UUID do contrato + mês)
    comment,        // descrição (ex: "Aluguel jul/2026 — Sala 12")
    clientPixKey,   // chave PIX do cliente (salva no profiles.pix_key_recebimento)
    expiresIn,      // segundos para expirar (padrão: 2592000 = 30 dias)
  } = body

  if (!value || !correlationID) {
    return { statusCode: 400, body: JSON.stringify({ error: 'value e correlationID são obrigatórios' }) }
  }

  const APP_ID = process.env.OPENPIX_APP_ID
  if (!APP_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENPIX_APP_ID não configurado no servidor' }) }
  }

  // Valor que vai para a subconta do cliente (total - taxa ImobiNota)
  const splitValue = Math.max(0, value - FEE_CENTS)

  const chargeBody = {
    value,
    correlationID,
    comment: comment || 'Cobrança ImobiNota',
    expiresIn: expiresIn || 2592000, // 30 dias
    // Split apenas se o cliente tiver subconta configurada e o valor cobrir a taxa
    ...(clientPixKey && splitValue > 0 ? {
      splits: [{
        pixKey: clientPixKey,
        value: splitValue,
        splitType: 'SPLIT_SUB_ACCOUNT',
      }],
    } : {}),
  }

  try {
    const res = await fetch('https://api.openpix.com.br/api/v1/charge', {
      method: 'POST',
      headers: {
        'Authorization': APP_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chargeBody),
    })

    const data = await res.json()

    if (!res.ok) {
      const msg = data?.error || data?.message || `Erro OpenPIX: ${res.status}`
      return { statusCode: 400, body: JSON.stringify({ error: msg }) }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        charge: data.charge,
        brCode: data.brCode,            // código PIX copia-e-cola
        pixQrCode: data.charge?.pixQrCode || null, // URL do QR code
        fee: FEE_CENTS,
        clientSplit: splitValue,
      }),
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
