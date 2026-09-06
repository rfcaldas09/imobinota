// Netlify Function — cria ou atualiza subconta no OpenPIX para um cliente
// Chamada automaticamente quando o cliente salva sua chave PIX na aba Integrações
// O token do OpenPIX é do operador (TechLinker) — nunca exposto ao cliente
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { name, pixKey } = body

  if (!name || !pixKey) {
    return { statusCode: 400, body: JSON.stringify({ error: 'name e pixKey são obrigatórios' }) }
  }

  const APP_ID = process.env.OPENPIX_APP_ID
  if (!APP_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENPIX_APP_ID não configurado no servidor' }) }
  }

  try {
    const res = await fetch('https://api.openpix.com.br/api/v1/subaccount', {
      method: 'POST',
      headers: {
        'Authorization': APP_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, pixKey }),
    })

    const data = await res.json()

    if (res.ok) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, subAccount: data.subAccount }),
      }
    }

    // Trata "subconta já existe" como sucesso — a chave já está cadastrada,
    // basta continuar usando ela normalmente
    const msg = (data?.error || data?.message || '').toLowerCase()
    const jaExiste = /already exist|j.{1,4}existe|duplicate|pixkey/i.test(msg)
      || res.status === 409
    if (jaExiste) {
      console.log('[openpix-create-subaccount] Subconta já existe para pixKey:', pixKey, '— tratando como OK')
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, existing: true }),
      }
    }

    // Erro real (chave PIX inválida, formato incorreto, etc.)
    return { statusCode: 400, body: JSON.stringify({ error: data?.error || data?.message || `Erro OpenPIX: ${res.status}` }) }

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
