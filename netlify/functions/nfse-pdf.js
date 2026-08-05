// Netlify Function — gera PDF de uma NFS-e já emitida
// Busca o registro em nfse_emissoes e retorna o PDF como base64 ou stream
//
// POST { userId, emissaoId }  → 200 { pdfBase64, filename }
// ou
// GET  /?userId=...&emissaoId=... (menos seguro, para debugging)

const { buildNfsePdf, extrairCamposPdf } = require('./nfse-pdf-lib')

exports.handler = async (event) => {
  try {
    return await handle(event)
  } catch (err) {
    console.error('[nfse-pdf]', err?.message)
    return { statusCode: 500, body: JSON.stringify({ error: err?.message }) }
  }
}

async function handle(event) {
  const SUPABASE_URL  = process.env.SUPABASE_URL
  const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY
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
  const emRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `nfse_emissoes?id=eq.${emissaoId}&user_id=eq.${userId}&select=*`
  )
  if (!emRes.ok) throw new Error(`Erro ao buscar emissão: ${emRes.status}`)
  const emissoes = await emRes.json()
  const em = emissoes[0]
  if (!em) return { statusCode: 404, body: JSON.stringify({ error: 'Emissão não encontrada' }) }

  // Busca perfil para dados do prestador (campos expandidos para o PDF)
  const profRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}&select=company_name,nome_fantasia,cnpj,inscricao_municipal,` +
    `nfse_municipio_nome,nfse_municipio_ibge,nfse_codigo_servico,nfse_serie,` +
    `nfse_logradouro,nfse_numero_end,nfse_bairro,nfse_cep,nfse_complemento,` +
    `aliquota_iss,regime_tributario,telefone,from_email,smtp_user`
  )
  const profile = (await profRes.json())[0] || {}

  // Busca cobrança para dados do tomador e endereço do imóvel
  let cobData = {
    tenant:     em.tomador_nome || extractXmlTag(em.xml_nfse || '', 'xNome') || '',
    totalValue: em.valor_servico || '0',
    mesRef:     em.competencia || '',
    cpf:        '',
    email:      '',
    property:   '',
    codServicoLc116: null,
  }
  if (em.cobranca_id) {
    const cobRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
      `cobrancas?id=eq.${em.cobranca_id}&select=contratos(imovel,cod_servico_lc116),inquilinos(nome,cpf,email)`
    )
    if (cobRes.ok) {
      const cobArr = await cobRes.json()
      const inq = cobArr[0]?.inquilinos
      const ctr = cobArr[0]?.contratos
      if (inq) {
        cobData.tenant = cobData.tenant || inq.nome || ''
        cobData.cpf    = inq.cpf   || ''
        cobData.email  = inq.email || ''
      }
      if (ctr) {
        cobData.property        = ctr.imovel            || ''
        cobData.codServicoLc116 = ctr.cod_servico_lc116 || null
      }
    }
  }

  const fields  = extrairCamposPdf(em.xml_nfse || '', cobData, profile)
  // sobrescreve com dados diretos da emissão (mais confiáveis que o XML)
  // Prioridade: número oficial do SEFIN > número sequencial interno (numero_dps)
  if (em.numero_nfse)       fields.numero = em.numero_nfse
  else if (em.numero_dps)   fields.numero = String(em.numero_dps)
  if (em.chave_acesso) { fields.chave = em.chave_acesso; fields.certificacao = em.chave_acesso.slice(0, 9).toUpperCase() }
  if (em.created_at)   fields.dhEmi  = em.created_at

  const pdfBuffer  = await buildNfsePdf(fields)
  const pdfBase64  = pdfBuffer.toString('base64')
  const filename   = `NFS-e_${em.numero_nfse || em.id}_${(em.competencia || '').replace('-', '_')}.pdf`

  return {
    statusCode: 200,
    body: JSON.stringify({ pdfBase64, filename }),
  }
}

// ── Supabase helper ───────────────────────────────────────────────
async function supabaseFetch(url, key, path, method = 'GET', body) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      'Prefer':        method === 'POST' ? 'return=representation' : '',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return res
}

// ── XML helper ───────────────────────────────────────────────────
function extractXmlTag(xml, tag) {
  const m = String(xml || '').match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`))
  return m ? m[1].trim() : null
}

