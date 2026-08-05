// Netlify Function — gera PDF de uma NFS-e já emitida
// Busca o registro em nfse_emissoes e retorna o PDF como base64 ou stream
//
// POST { userId, emissaoId }  → 200 { pdfBase64, filename }
// ou
// GET  /?userId=...&emissaoId=... (menos seguro, para debugging)

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

  // Busca perfil para dados do prestador
  const profRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}&select=company_name,cnpj,inscricao_municipal`
  )
  const profile = (await profRes.json())[0] || {}

  // Extrai campos do XML
  const xml    = em.xml_nfse || ''
  const cobData = {
    tenant:     em.tomador_nome || extractXmlTag(xml, 'xNome') || '',
    totalValue: em.valor_servico || '0',
    mesRef:     em.competencia || '',
    property:   em.imovel || '',
    email:      em.email || '',
  }

  const fields = {
    numero:       em.numero_nfse || '',
    chave:        em.chave_acesso || '',
    dhEmi:        em.created_at || '',
    prestador:    profile.company_name || '',
    tomador:      cobData.tenant || extractXmlTag(xml, 'xNome') || '',
    valorServico: cobData.totalValue,
    competencia:  cobData.mesRef,
    cnpj:         profile.cnpj || '',
    inscMun:      profile.inscricao_municipal || '',
    descServico:  extractXmlTag(xml, 'xDiscServ') || extractXmlTag(xml, 'discriminacao') || '',
  }

  const pdfBuffer  = buildNfsePdf(fields)
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

// ── PDF generator (raw PDF 1.4, sem dependências externas) ───────
function toPdfStr(s) {
  let r = ''
  for (const c of String(s || '')) {
    const code = c.charCodeAt(0)
    if (code === 40) r += '\\('
    else if (code === 41) r += '\\)'
    else if (code === 92) r += '\\\\'
    else if (code > 126) r += '\\' + code.toString(8).padStart(3, '0')
    else r += c
  }
  return r
}

function buildNfsePdf(fields) {
  const {
    numero = '', chave = '', dhEmi = '', prestador = '',
    tomador = '', valorServico = '', competencia = '',
    cnpj = '', inscMun = '', descServico = '',
  } = fields

  const fmtVal = v => {
    const n = parseFloat(v) || 0
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  }

  const fmtDate = iso => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d)) return iso
    return d.toLocaleDateString('pt-BR')
  }

  const fmtComp = c => {
    if (!c) return ''
    const [y, m] = String(c).split('-')
    return m ? `${m}/${y}` : c
  }

  const W = 595, H = 842, M = 50
  const ops = []

  const put = (txt, x, y, sz, bold) => {
    ops.push(`/${bold ? 'F2' : 'F1'} ${sz} Tf 1 0 0 1 ${x} ${y} Tm (${toPdfStr(txt)}) Tj`)
  }
  const hrule = (y, w = W - 2 * M) =>
    ops.push(`${M} ${y} m ${M + w} ${y} l S`)

  // Cabeçalho
  put('NOTA FISCAL DE SERVICOS ELETRONICOS - NFS-e', M, H - M, 14, true)
  put('Sistema Nacional NFS-e (SEFIN)', M, H - M - 18, 9, false)
  hrule(H - M - 26)

  let y = H - M - 50
  // Identificação
  put('IDENTIFICACAO', M, y, 10, true)
  y -= 16
  put('Numero NFS-e:', M, y, 9, true);    put(numero, 160, y, 9, false)
  put('Competencia:', 310, y, 9, true);    put(fmtComp(competencia), 400, y, 9, false)
  y -= 14
  put('Data de Emissao:', M, y, 9, true); put(fmtDate(dhEmi), 160, y, 9, false)
  y -= 14
  put('Chave de Acesso:', M, y, 9, true); put(chave, 160, y, 7, false)
  y -= 20; hrule(y)

  // Prestador
  y -= 16; put('PRESTADOR DE SERVICOS', M, y, 10, true)
  y -= 14; put('Razao Social / Nome:', M, y, 9, true); put(prestador, 160, y, 9, false)
  y -= 14; put('CNPJ / CPF:', M, y, 9, true); put(cnpj, 160, y, 9, false)
  put('Inscricao Municipal:', 310, y, 9, true); put(inscMun, 420, y, 9, false)
  y -= 20; hrule(y)

  // Tomador
  y -= 16; put('TOMADOR DE SERVICOS', M, y, 10, true)
  y -= 14; put('Razao Social / Nome:', M, y, 9, true); put(tomador, 160, y, 9, false)
  y -= 20; hrule(y)

  // Serviço / Valor
  y -= 16; put('DISCRIMINACAO DO SERVICO E VALORES', M, y, 10, true)
  y -= 14
  if (descServico) { put(descServico.slice(0, 110), M, y, 9, false); y -= 14 }
  put('Valor do Servico:', M, y, 9, true)
  put(fmtVal(valorServico), 160, y, 12, true)
  y -= 24; hrule(y)

  // Rodapé
  y -= 14
  put('Documento gerado pelo sistema NotaFacil — para verificar a autenticidade consulte o portal da Prefeitura.', M, y, 7, false)

  const cs = 'BT\n' + ops.join('\n') + '\nET'

  // Monta objetos PDF
  const objs = [
    '<</Type /Catalog /Pages 2 0 R>>',
    '<</Type /Pages /Kids [3 0 R] /Count 1>>',
    `<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources <</Font <</F1 5 0 R /F2 6 0 R>>>>>>`,
    `<</Length ${Buffer.byteLength(cs, 'latin1')}>>\nstream\n${cs}\nendstream`,
    '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding>>',
    '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding>>',
  ]

  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const parts = [header]
  const offsets = []

  for (let i = 0; i < objs.length; i++) {
    offsets.push(Buffer.byteLength(parts.join(''), 'latin1'))
    parts.push(`${i + 1} 0 obj\n${objs[i]}\nendobj\n`)
  }

  const xrefOffset = Buffer.byteLength(parts.join(''), 'latin1')
  const xrefLines  = ['xref', `0 ${objs.length + 1}`, '0000000000 65535 f ']
  for (const off of offsets) xrefLines.push(String(off).padStart(10, '0') + ' 00000 n ')
  parts.push(xrefLines.join('\n'))
  parts.push(`\ntrailer\n<</Size ${objs.length + 1} /Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  return Buffer.from(parts.join(''), 'latin1')
}
