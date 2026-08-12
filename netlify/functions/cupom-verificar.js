// Netlify Function — verifica cupom de desconto
// POST { codigo: string }
// Returns { ok: true, valorMensal: number } | { error: string }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { codigo } = body
  if (!codigo || typeof codigo !== 'string' || !codigo.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Código do cupom é obrigatório' }) }
  }

  const SUPABASE_URL     = process.env.SUPABASE_URL
  const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Configuração interna ausente' }) }
  }

  try {
    const codigoUpper = codigo.trim().toUpperCase()

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/cupons?codigo=eq.${encodeURIComponent(codigoUpper)}&ativo=eq.true&select=codigo,valor_mensal`,
      {
        headers: {
          'apikey':        SUPABASE_SVC_KEY,
          'Authorization': `Bearer ${SUPABASE_SVC_KEY}`,
        },
      }
    )

    const rows = await res.json()

    if (!res.ok || !Array.isArray(rows) || rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Cupom inválido ou inativo' }) }
    }

    const cupom = rows[0]
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok:          true,
        valorMensal: parseFloat(cupom.valor_mensal),
      }),
    }
  } catch (err) {
    console.error('[cupom-verificar] Erro:', err.message)
    return { statusCode: 500, body: JSON.stringify({ error: `Erro interno: ${err.message}` }) }
  }
}
