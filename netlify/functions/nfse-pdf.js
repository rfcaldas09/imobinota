// Netlify Function — gera PDF de uma NFS-e já emitida
// Busca o registro em nfse_emissoes e retorna o PDF como base64 ou stream
//
// POST { userId, emissaoId }  → 200 { pdfBase64, filename }
// ou
// GET  /?userId=...&emissaoId=... (menos seguro, para debugging)

const { buildNfsePdf, extrairCamposPdf } = require('./nfse-pdf-lib')
const { checkParentAuth } = require('./_parent-auth')

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

  // Valida que o caller (JWT) é o próprio userId ou seu pai (contabilidade)
  const authError = await checkParentAuth(event, userId)
  if (authError) return authError

  // Busca emissão (garante que pertence ao userId)
  const emRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `nfse_emissoes?id=eq.${emissaoId}&user_id=eq.${userId}&select=*`
  )
  if (!emRes.ok) throw new Error(`Erro ao buscar emissão: ${emRes.status}`)
  const emissoes = await emRes.json()
  const em = emissoes[0]
  if (!em) return { statusCode: 404, body: JSON.stringify({ error: 'Emissão não encontrada' }) }

  // Busca perfil para dados do prestador (select=* evita erros de colunas inexistentes)
  const profRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}&select=*`
  )
  const profJson = await profRes.json()
  const profile  = Array.isArray(profJson) ? (profJson[0] || {}) : {}

  // Busca cobrança para dados do tomador e endereço do imóvel
  // Inicializa cobData — tenant vazio para não capturar nome errado do XML
  let cobData = {
    tenant:          '',
    totalValue:      em.valor_servico || '0',
    mesRef:          em.competencia   || '',
    cpf:             '',
    email:           '',
    property:        '',
    codServicoLc116: null,
  }
  if (em.cobranca_id) {
    const cobRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
      `cobrancas?id=eq.${em.cobranca_id}&select=contratos(imovel,cod_servico_lc116,toma_cod_mun,toma_mun_nome),inquilinos(nome,cpf,email)`
    )
    if (cobRes.ok) {
      const cobArr = await cobRes.json()
      const inq = Array.isArray(cobArr) ? cobArr[0]?.inquilinos : null
      const ctr = Array.isArray(cobArr) ? cobArr[0]?.contratos  : null
      if (inq) {
        cobData.tenant = inq.nome  || ''
        cobData.cpf    = inq.cpf   || ''
        cobData.email  = inq.email || ''
      }
      if (ctr) {
        cobData.property        = ctr.imovel            || ''
        cobData.codServicoLc116 = ctr.cod_servico_lc116 || null
        // Retroativo: popula tomadorEnd com município caso não tenha vindo do cob_data_json
        // Guarda dados do contrato para enriquecer depois do overlay cob_data_json
        cobData._dbTomaMunNome = ctr.toma_mun_nome || ''
        cobData._dbTomaCodMun  = ctr.toma_cod_mun  || ''
      }
    }
  }
  // Fallback: se não veio do join, usa tomador_nome salvo na emissão
  if (!cobData.tenant) cobData.tenant = em.tomador_nome || ''

  // Overlay com dados do cob_data_json — essencial para notas avulsas (sem cobranca_id)
  // onde cpf e tomadorEnd não são resgatáveis via join em cobrancas/inquilinos
  if (em.cob_data_json) {
    try {
      const cd = typeof em.cob_data_json === 'string'
        ? JSON.parse(em.cob_data_json)
        : em.cob_data_json
      if (!cobData.cpf   && cd.cpf)   cobData.cpf       = cd.cpf
      if (!cobData.email && cd.email) cobData.email      = cd.email
      if (cd.tomadorEnd)              cobData.tomadorEnd = cd.tomadorEnd
      if (cd.ibsCbs)                  cobData.ibsCbs     = cd.ibsCbs
    } catch (_) { /* JSON inválido — ignora */ }
  }

  // ── Enriquecimento do tomadorEnd com município ──────────────────
  // Feito APÓS o overlay do cob_data_json para não ser sobrescrito
  if (cobData.tomadorEnd && !cobData.tomadorEnd.munNome) {
    // 1. Tenta DB (contrato)
    if (cobData._dbTomaMunNome) {
      cobData.tomadorEnd.munNome = cobData._dbTomaMunNome
      cobData.tomadorEnd.codMun  = cobData.tomadorEnd.codMun || cobData._dbTomaCodMun
    }
    // 2. Fallback ViaCEP — usa o CEP já disponível no tomadorEnd
    if (!cobData.tomadorEnd.munNome && cobData.tomadorEnd.cep) {
      try {
        const digits = String(cobData.tomadorEnd.cep).replace(/\D/g, '').slice(0, 8)
        if (digits.length === 8) {
          const vr = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(3000) })
          if (vr.ok) {
            const vd = await vr.json()
            if (!vd.erro) {
              cobData.tomadorEnd.munNome = vd.localidade || ''
              if (!cobData.tomadorEnd.codMun && vd.ibge) cobData.tomadorEnd.codMun = vd.ibge
            }
          }
        }
      } catch (_) { /* ViaCEP indisponível — continua sem nome */ }
    }
  }
  delete cobData._dbTomaMunNome
  delete cobData._dbTomaCodMun

  // Passa discriminação salva na emissão (tem prioridade sobre xInfComp do XML)
  if (em.discriminacao_servico) cobData.discriminacao = em.discriminacao_servico

  const fields  = extrairCamposPdf(em.xml_nfse || '', cobData, profile)

  // IBS/CBS overlay — sistemas legado (AtendeNet) não incluem os valores no XML de retorno.
  // Os valores calculados na emissão ficam salvos em cob_data_json.ibsCbs.
  if (cobData.ibsCbs) {
    const ic = cobData.ibsCbs
    if (!fields.cbs          && ic.cbs)       fields.cbs          = ic.cbs
    if (!fields.ibsEstadual  && ic.ibsUf)     fields.ibsEstadual  = ic.ibsUf
    if (!fields.ibsMunicipal && ic.ibsMun)    fields.ibsMunicipal = ic.ibsMun
    if (!fields.ibsBase      && ic.base)      fields.ibsBase      = ic.base
    // total: prefere ic.total mas recalcula somando componentes se vier zerado
    if (!fields.totalIbsCbs) {
      const sumTotal = parseFloat(((ic.cbs || 0) + (ic.ibsUf || 0) + (ic.ibsMun || 0)).toFixed(2))
      fields.totalIbsCbs = sumTotal || ic.total || 0
    }
    if (!fields.codigoNbs    && ic.nbs)       fields.codigoNbs    = ic.nbs
    if (!fields.codigoCST    && ic.cst)       fields.codigoCST    = ic.cst
    if (!fields.codigoClassTrib && ic.classTrib) fields.codigoClassTrib = ic.classTrib
    if (!fields.indicadorOp  && ic.indOp)     fields.indicadorOp  = ic.indOp
  }

  // Fallback IBS/CBS por perfil — para notas emitidas antes do ibsCbs ser salvo no cobData.
  // Só preenche se nenhum valor IBS/CBS veio do XML ou do cobData.ibsCbs,
  // e o perfil tem CST configurado (indica município com IBS/CBS ativo).
  if (!fields.cbs && !fields.ibsEstadual && !fields.ibsMunicipal) {
    const alqCbs    = parseFloat(profile?.aliquota_cbs    || 0)
    const alqIbsUf  = parseFloat(profile?.aliquota_ibs_uf  || 0)
    const alqIbsMun = parseFloat(profile?.aliquota_ibs_mun || 0)
    const nfseCst   = profile?.nfse_cst || ''
    if (alqCbs > 0 && nfseCst && fields.valorBruto > 0) {
      const base = fields.valorBruto
      fields.ibsBase      = base
      fields.cbs          = parseFloat((base * alqCbs    / 100).toFixed(2))
      fields.ibsEstadual  = parseFloat((base * alqIbsUf  / 100).toFixed(2))
      fields.ibsMunicipal = parseFloat((base * alqIbsMun / 100).toFixed(2))
      fields.totalIbsCbs  = parseFloat((base * (alqIbsUf + alqIbsMun) / 100).toFixed(2))
      if (!fields.codigoCST)       fields.codigoCST       = nfseCst
      if (!fields.codigoClassTrib) fields.codigoClassTrib = profile?.nfse_cclasstrib || ''
      if (!fields.indicadorOp)     fields.indicadorOp     = profile?.nfse_cindop     || ''
      if (!fields.codigoNbs)       fields.codigoNbs       = String(profile?.nfse_nbs || '').replace(/\./g, '')
    }
  }

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

