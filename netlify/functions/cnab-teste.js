// Netlify Function — gera CNAB 240 + boletos PDF de teste para homologação Caixa
// Disponível para qualquer usuário com conta Caixa configurada
// POST { userId, contaId, authToken }
// Retorna: ZIP (base64) com arquivo CNAB + PDFs de boleto

const JSZip = require('jszip')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }
  try {
    return await handle(event)
  } catch (err) {
    console.error('[cnab-teste]', err?.message, err?.stack)
    return { statusCode: 500, body: JSON.stringify({ error: err?.message || 'Erro interno' }) }
  }
}

async function handle(event) {
  const SB_URL = process.env.SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY
  if (!SB_URL || !SB_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { userId, contaId, authToken } = body
  if (!userId || !authToken) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId e authToken são obrigatórios' }) }
  }

  // ── Valida usuário via Supabase auth ─────────────────────
  const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${authToken}`,
    },
  })
  if (!userRes.ok) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Token inválido' }) }
  }
  const authUser = await userRes.json()
  if (!authUser?.id) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Usuário não autenticado.' }) }
  }

  // ── Busca perfil + cnab_config do usuário alvo ───────────
  const profRes = await sbFetch(SB_URL, SB_KEY, `profiles?id=eq.${userId}&select=company_name,cnpj,cnab_config`)
  if (!profRes.ok) throw new Error(`Erro ao buscar perfil: ${profRes.status}`)
  const profileArr = await profRes.json()
  const profile    = profileArr?.[0]
  if (!profile) return { statusCode: 404, body: JSON.stringify({ error: 'Usuário não encontrado' }) }

  const raw = profile.cnab_config
  let contas = Array.isArray(raw) ? raw : (raw ? [{ id: 'legacy', ...raw }] : [])
  if (contas.length === 0) {
    return { statusCode: 422, body: JSON.stringify({ error: 'Nenhuma conta bancária configurada.' }) }
  }

  // Busca conta: por id → por banco='caixa' → primeira da lista
  let cc = (contaId ? contas.find(c => c.id === contaId) : null)
         || contas.find(c => (c.banco || '').toLowerCase() === 'caixa')
         || contas[0]

  if ((cc.banco || '').toLowerCase() !== 'caixa') {
    return { statusCode: 422, body: JSON.stringify({ error: `Esta função só suporta Caixa. Banco configurado: ${cc.banco}` }) }
  }

  if (!cc.cedente) {
    return { statusCode: 422, body: JSON.stringify({ error: 'Código do cedente Caixa não configurado.' }) }
  }

  // ── Insere registros fake ─────────────────────────────────
  // 9 registros com valores variados para garantir DVs diferentes
  const hoje     = new Date()
  const vencDate = new Date(hoje); vencDate.setDate(vencDate.getDate() + 10)
  const vencISO  = vencDate.toISOString().slice(0, 10)
  const competencia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`

  // Valores que tendem a gerar DVs 1-9 no módulo 10 do campo livre Caixa
  const valoresBase = [100.01, 200.03, 300.07, 400.11, 500.23, 600.47, 700.89, 800.97, 900.99]

  const fakeRecords = valoresBase.map((valor, i) => ({
    user_id:         userId,
    status:          'emitida',
    numero_nfse:     9000001 + i,
    numero_dps:      null,
    tomador_nome:    'TESTE HOMOLOGACAO CAIXA',
    valor_servico:   valor,
    competencia,
    vencimento_boleto: vencISO,
    cob_data_json: {
      tenant:       'TESTE HOMOLOGACAO CAIXA',
      vencimento:   vencISO,
      totalValue:   valor,
    },
  }))

  // Insere em lote
  const insRes = await sbFetch(SB_URL, SB_KEY, 'nfse_emissoes', 'POST', fakeRecords, {
    'Prefer': 'return=representation',
  })
  if (!insRes.ok) {
    const errTxt = await insRes.text()
    throw new Error(`Erro ao inserir registros fake: ${insRes.status} — ${errTxt}`)
  }
  const inserted = await insRes.json()
  const fakeIds  = inserted.map(r => r.id)

  if (fakeIds.length === 0) throw new Error('Nenhum registro fake foi criado.')

  let cnabText, cnabFilename, pdfBase64, pdfFilename

  try {
    // ── URL base das funções Netlify ──────────────────────
    const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888'

    // ── Chama cnab-gerar ──────────────────────────────────
    const vencStr = `${String(vencDate.getDate()).padStart(2, '0')}/${String(vencDate.getMonth() + 1).padStart(2, '0')}/${vencDate.getFullYear()}`

    const cnabRes = await fetch(`${baseUrl}/.netlify/functions/cnab-gerar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        emissaoIds: fakeIds,
        contaId: cc.id,
        vencimento: vencStr,
        isTeste: true,  // Caixa SIGCB: grava 'REMESSA-TESTE' no header para homologação
      }),
    })
    if (!cnabRes.ok) {
      const errTxt = await cnabRes.text()
      throw new Error(`cnab-gerar: ${cnabRes.status} — ${errTxt}`)
    }
    const cnabData = await cnabRes.json()
    cnabText    = cnabData.cnabText
    cnabFilename = cnabData.filename || 'remessa_teste.rem'

    // ── Chama boleto-pdf ──────────────────────────────────
    const pdfRes = await fetch(`${baseUrl}/.netlify/functions/boleto-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        emissaoIds: fakeIds,
        contaId: cc.id,
        vencimento: vencStr,
      }),
    })
    if (!pdfRes.ok) {
      const errTxt = await pdfRes.text()
      throw new Error(`boleto-pdf: ${pdfRes.status} — ${errTxt}`)
    }
    const pdfData = await pdfRes.json()
    pdfBase64   = pdfData.pdfBase64
    pdfFilename  = pdfData.filename || 'boletos_teste.pdf'

  } finally {
    // ── Deleta registros fake (sempre, mesmo em erro) ─────
    const idsParam = fakeIds.map(id => `"${id}"`).join(',')
    await sbFetch(SB_URL, SB_KEY,
      `nfse_emissoes?id=in.(${idsParam})&user_id=eq.${userId}`,
      'DELETE'
    ).catch(e => console.error('[cnab-teste] Falha ao deletar fakes:', e.message))
  }

  // ── Monta ZIP ─────────────────────────────────────────────
  const zip = new JSZip()
  zip.file(cnabFilename, cnabText)
  zip.file(pdfFilename,  Buffer.from(pdfBase64, 'base64'))

  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  const dd = String(hoje.getDate()).padStart(2, '0')
  const mm = String(hoje.getMonth() + 1).padStart(2, '0')
  const zipFilename = `teste_caixa_${dd}${mm}${hoje.getFullYear()}.zip`

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFilename}"`,
    },
    isBase64Encoded: true,
    body: zipBuf.toString('base64'),
  }
}

// ── Helpers ───────────────────────────────────────────────────
async function sbFetch(url, key, path, method = 'GET', body, extraHeaders = {}) {
  const opts = {
    method,
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      ...extraHeaders,
    },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  return fetch(`${url}/rest/v1/${path}`, opts)
}
