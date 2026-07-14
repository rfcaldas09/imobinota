// Netlify Function — gera boleto bancário via OpenPIX (/api/v1/boleto)
// O boleto é do tipo Boleto+PIX: o inquilino pode pagar pelo código de barras
// (agendável nos apps de banco) OU pelo QR code PIX (instantâneo).
//
// O valor da taxa ImobiNota (R$2,99) fica na conta principal.
// O restante é creditado na subconta do cliente via split e sacado automaticamente no webhook.
//
// ⚠️  REQUISITO: módulo Boleto habilitado na conta OpenPIX.
//     Acesse: painel OpenPIX → Configurações → Boleto → ativar
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
    correlationID,  // UUID da cobrança no Supabase
    comment,        // descrição resumida (aparece no boleto e no extrato)
    additionalInfo, // array [{ key, value }] — itens discriminados no boleto
    clientPixKey,   // chave PIX do cliente (subconta OpenPIX)
    dueDate,        // "YYYY-MM-DD" — data de vencimento
    customer,       // { name, taxID, email, phone?, address? }
  } = body

  if (!value || !correlationID || !customer?.name || !customer?.taxID) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'value, correlationID, customer.name e customer.taxID são obrigatórios' }),
    }
  }

  const APP_ID = process.env.OPENPIX_APP_ID
  if (!APP_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENPIX_APP_ID não configurado no servidor' }) }
  }

  const splitValue = Math.max(0, value - FEE_CENTS)

  // Vencimento: usa o informado, ou 30 dias como fallback
  const dueDateFinal = dueDate || (() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().split('T')[0]
  })()

  const boletoBody = {
    value,
    correlationID,
    comment:  comment || 'Cobrança ImobiNota',
    dueDate:  dueDateFinal,
    // Itens discriminados — aparecem no corpo do boleto (campo suportado pelo OpenPIX)
    ...(Array.isArray(additionalInfo) && additionalInfo.length > 0
      ? { additionalInfo }
      : {}),
    customer: {
      name:  customer.name,
      taxID: customer.taxID.replace(/\D/g, ''), // CPF/CNPJ só dígitos
      ...(customer.email   ? { email: customer.email }                       : {}),
      ...(customer.phone   ? { phone: customer.phone.replace(/\D/g, '') }    : {}),
      ...(customer.address ? { address: customer.address }                   : {}),
    },
    ...(clientPixKey && splitValue > 0 ? {
      splits: [{
        pixKey:    clientPixKey,
        value:     splitValue,
        splitType: 'SPLIT_SUB_ACCOUNT',
      }],
    } : {}),
  }

  try {
    const res = await fetch('https://api.openpix.com.br/api/v1/boleto', {
      method: 'POST',
      headers: {
        'Authorization': APP_ID,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(boletoBody),
    })

    const data = await res.json()

    if (!res.ok) {
      const msg = data?.error || data?.message || `Erro OpenPIX: ${res.status}`
      console.error('[openpix-create-charge] Erro:', JSON.stringify(data))
      return { statusCode: 400, body: JSON.stringify({ error: msg, detail: data }) }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        digitableLine: data.boleto?.digitableLine || null, // linha digitável
        bankSlipUrl:   data.boleto?.bankSlipUrl   || null, // PDF do boleto
        dueDate:       data.boleto?.expiresDate   || dueDateFinal,
        brCode:        data.charge?.brCode        || null, // PIX copia-e-cola embutido
        fee:           FEE_CENTS,
        clientSplit:   splitValue,
      }),
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
