// Netlify Function — retorna o XML de uma NFS-e já emitida
// POST { userId, emissaoId } → 200 { xmlBase64, filename }

exports.handler = async (event) => {
  try {
    return await handle(event)
  } catch (err) {
    console.error('[nfse-xml]', err?.message)
    return { statusCode: 500, body: JSON.stringify({ error: err?.message }) }
  }
}

async function handle(event) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }

  let userId, emissaoId
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}')
    userId    = body.userId
    emissaoId = body.emissaoId
  } else {
    userId    = event.queryStringParameters?.userId
    emissaoId = event.queryStringParameters?.emissaoId
  }

  if (!userId || !emissaoId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId e emissaoId são obrigatórios' }) }
  }

  // Busca emissão (garante que pertence ao userId)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/nfse_emissoes?id=eq.${emissaoId}&user_id=eq.${userId}&select=xml_nfse,numero_nfse,competencia`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  )
  if (!res.ok) throw new Error(`Erro ao buscar emissão: ${res.status}`)
  const rows = await res.json()
  const em   = rows[0]
  if (!em)          return { statusCode: 404, body: JSON.stringify({ error: 'Emissão não encontrada' }) }
  if (!em.xml_nfse) return { statusCode: 404, body: JSON.stringify({ error: 'XML não disponível para esta emissão' }) }

  const comp     = (em.competencia || '').replace('-', '_')
  const filename = `NFS-e_${em.numero_nfse || emissaoId}_${comp}.xml`
  const xmlBase64 = Buffer.from(em.xml_nfse, 'utf8').toString('base64')

  return {
    statusCode: 200,
    body: JSON.stringify({ xmlBase64, filename }),
  }
}
