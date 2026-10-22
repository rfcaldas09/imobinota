// Netlify Function — gera arquivo CNAB 400 Bradesco (remessa)
// POST { userId, emissaoIds: [uuid, ...] }
// Retorna { cnabText, filename, totalTitulos, valorTotal }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) }
  }
  try {
    return await handle(event)
  } catch (err) {
    console.error('[cnab-gerar]', err?.message)
    return { statusCode: 500, body: JSON.stringify({ error: err?.message }) }
  }
}

async function handle(event) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) }
  }

  const { userId, emissaoIds } = body
  if (!userId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId é obrigatório' }) }
  }
  if (!Array.isArray(emissaoIds) || emissaoIds.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'emissaoIds é obrigatório' }) }
  }

  // ── Busca perfil + cnab_config ────────────────────────────────
  const profRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}&select=company_name,cnpj,cnab_config`
  )
  if (!profRes.ok) throw new Error(`Erro ao buscar perfil: ${profRes.status}`)
  const profileArr = await profRes.json()
  const profile    = profileArr?.[0] || {}
  const cc = (profile.cnab_config && typeof profile.cnab_config === 'object')
    ? profile.cnab_config
    : {}

  // Validações da config bancária
  if (!cc.cod_empresa) {
    return { statusCode: 422, body: JSON.stringify({ error: 'Código da empresa Bradesco não configurado. Configure em Configurações → Integrações.' }) }
  }
  if (!cc.agencia || !cc.conta || !cc.carteira) {
    return { statusCode: 422, body: JSON.stringify({ error: 'Agência, conta e carteira Bradesco não configurados. Configure em Configurações → Integrações.' }) }
  }

  // ── Busca emissões ────────────────────────────────────────────
  const ids = emissaoIds.map(id => `"${id}"`).join(',')
  const emRes = await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `nfse_emissoes?id=in.(${ids})&user_id=eq.${userId}&status=eq.emitida` +
    `&select=id,numero_nfse,numero_dps,tomador_nome,valor_servico,created_at,competencia,cob_data_json`
  )
  if (!emRes.ok) throw new Error(`Erro ao buscar emissões: ${emRes.status}`)
  const emissoes = await emRes.json()

  if (!emissoes || emissoes.length === 0) {
    return { statusCode: 422, body: JSON.stringify({ error: 'Nenhuma nota com status "emitida" encontrada nos IDs fornecidos.' }) }
  }

  // ── Gera arquivo CNAB 400 ─────────────────────────────────────
  const seqRemessa = cc.seq_remessa || 1
  const hoje = new Date()
  const { cnabText, totalTitulos, valorTotal } = gerarCNAB400({
    cc, profile, emissoes, seqRemessa, hoje
  })

  // ── Incrementa seq_remessa no perfil ─────────────────────────
  const novaConfig = { ...cc, seq_remessa: seqRemessa + 1 }
  await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}`,
    'PATCH',
    { cnab_config: novaConfig }
  )

  // ── Nome do arquivo ───────────────────────────────────────────
  const dd   = String(hoje.getDate()).padStart(2, '0')
  const mm   = String(hoje.getMonth() + 1).padStart(2, '0')
  const seq2 = String(seqRemessa).padStart(2, '0').slice(-2)
  const filename = `CB${dd}${mm}${seq2}.REM`

  return {
    statusCode: 200,
    body: JSON.stringify({ cnabText, filename, totalTitulos, valorTotal }),
    headers: { 'Content-Type': 'application/json' },
  }
}

// ════════════════════════════════════════════════════════════════
//  Geração do CNAB 400
// ════════════════════════════════════════════════════════════════

function gerarCNAB400({ cc, profile, emissoes, seqRemessa, hoje }) {
  const linhas = []
  let seq = 1

  linhas.push(buildHeader({ cc, profile, seqRemessa, hoje, seq: seq++ }))

  let totalValor = 0
  emissoes.forEach((em, idx) => {
    const nossoNumero = nossoNumeroStr(em, idx + 1)
    linhas.push(buildTransacao1({ cc, em, nossoNumero, hoje, seq: seq++ }))
    totalValor += parseFloat(em.valor_servico || 0)
  })

  linhas.push(buildTrailer(seq))

  const cnabText = linhas.join('\r\n') + '\r\n'
  return { cnabText, totalTitulos: emissoes.length, valorTotal: totalValor }
}

// ── Helpers de formatação ─────────────────────────────────────
// Alfanumérico: esquerda, preenche espaço
const A = (v, len) => String(v || '').toUpperCase().replace(/[\r\n]/g, ' ').slice(0, len).padEnd(len, ' ')
// Numérico: direita, preenche zero
const N = (v, len) => String(v || '').replace(/\D/g, '').padStart(len, '0').slice(-len)

function fmtDataDDMMaa(date) {
  const d = date instanceof Date ? date : new Date(date)
  return String(d.getDate()).padStart(2, '0') +
         String(d.getMonth() + 1).padStart(2, '0') +
         String(d.getFullYear()).slice(2)
}

function calcVencimento(emCreatedAt) {
  const d = new Date(emCreatedAt || Date.now())
  d.setDate(d.getDate() + 30)
  return d
}

function fmtValor13(v) {
  const cents = Math.round(parseFloat(v || 0) * 100)
  return String(cents).padStart(13, '0')
}

// DAC Nosso Número — módulo 11 base 7 (carteira 3 + nossoNumero 11 = 14 dígitos)
function calcDacNossoNumero(carteira, nossoNumero) {
  const full = N(carteira, 3) + N(nossoNumero, 11)
  let sum = 0, factor = 2
  for (let i = full.length - 1; i >= 0; i--) {
    sum += parseInt(full[i], 10) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const rem = sum % 11
  return (rem === 0 || rem === 1) ? '1' : String(11 - rem)
}

function nossoNumeroStr(em, fallbackIdx) {
  const raw = (em.numero_nfse || em.numero_dps || String(fallbackIdx)).replace(/\D/g, '')
  return N(raw, 11)
}

// Posições 021-037 (17 chars): '0' + carteira(3) + agência(5) + conta(7) + dv_conta(1)
function identEmpresa(cc) {
  return '0' + N(cc.carteira, 3) + N(cc.agencia, 5) + N(cc.conta, 7) + (cc.conta_dv || '0')
}

function parseCobData(em) {
  try {
    return typeof em.cob_data_json === 'string'
      ? JSON.parse(em.cob_data_json)
      : (em.cob_data_json || {})
  } catch { return {} }
}

// ── Header Label (Registro 0) ─────────────────────────────────
function buildHeader({ cc, profile, seqRemessa, hoje, seq }) {
  let r = ''
  r += '0'                                         // 001
  r += '1'                                         // 002
  r += 'REMESSA'                                   // 003-009
  r += '01'                                        // 010-011
  r += A('COBRANCA', 15)                           // 012-026
  r += N(cc.cod_empresa, 20)                       // 027-046: código cedente Bradesco
  r += A(profile.company_name || 'EMPRESA', 30)    // 047-076
  r += '237'                                       // 077-079
  r += A('BRADESCO', 15)                           // 080-094
  r += fmtDataDDMMaa(hoje)                         // 095-100
  r += ' '.repeat(8)                               // 101-108
  r += 'MX'                                        // 109-110
  r += N(seqRemessa, 7)                            // 111-117
  r += ' '.repeat(277)                             // 118-394
  r += N(seq, 6)                                   // 395-400

  if (r.length !== 400) throw new Error(`Header: ${r.length} chars (esperado 400)`)
  return r
}

// ── Registro Tipo 1 (transação) ───────────────────────────────
function buildTransacao1({ cc, em, nossoNumero, hoje, seq }) {
  const cd      = parseCobData(em)
  const dac     = calcDacNossoNumero(cc.carteira, nossoNumero)
  const venc    = calcVencimento(em.created_at)
  const emDt    = new Date(em.created_at || hoje)

  const cpfCnpj = (cd.cpf || '').replace(/\D/g, '')
  const tipoPag = cpfCnpj.length <= 11 ? '01' : '02'

  const end    = cd.tomadorEnd || {}
  const logNum = [end.logradouro, end.numero].filter(Boolean).join(', ')
  const cepRaw = (end.cep || '').replace(/\D/g, '')

  const numDoc = N((em.numero_nfse || em.numero_dps || '').replace(/\D/g, ''), 10)
  const msg1   = A('NFS-e ' + (em.numero_nfse || em.numero_dps || ''), 12)
  const msg2   = A(em.competencia || '', 60)

  let r = ''
  r += '1'                          // 001
  r += ' '.repeat(19)               // 002-020: débito automático (não usado)
  r += identEmpresa(cc)             // 021-037 (17 chars)
  r += A(em.id || nossoNumero, 25)  // 038-062: nº controle participante
  r += '000'                        // 063-065: banco débito (sem débito auto)
  r += '0'                          // 066: sem multa
  r += '0000'                       // 067-070: percentual multa
  r += nossoNumero                  // 071-081 (11 chars)
  r += dac                          // 082: DAC
  r += '0'.repeat(10)               // 083-092: desconto bonif/dia
  r += '2'                          // 093: cliente emite boleto
  r += 'N'                          // 094: sem débito automático
  r += ' '.repeat(10)               // 095-104
  r += ' '                          // 105: indicador rateio
  r += ' '                          // 106: endereçamento débito auto
  r += '00'                         // 107-108: qtd pagamentos
  r += '01'                         // 109-110: ocorrência = entrada de título
  r += numDoc                       // 111-120 (10 chars)
  r += fmtDataDDMMaa(venc)          // 121-126: vencimento
  r += fmtValor13(em.valor_servico) // 127-139 (13 chars)
  r += '000'                        // 140-142
  r += '00000'                      // 143-147
  r += '12'                         // 148-149: duplicata de serviço
  r += 'N'                          // 150
  r += fmtDataDDMMaa(emDt)          // 151-156: data emissão
  r += '00'                         // 157-158: 1ª instrução
  r += '00'                         // 159-160: 2ª instrução
  r += '0'.repeat(13)               // 161-173: mora/dia
  r += '000000'                     // 174-179: data limite desconto
  r += '0'.repeat(13)               // 180-192: valor desconto
  r += '0'.repeat(13)               // 193-205: IOF
  r += '0'.repeat(13)               // 206-218: abatimento
  r += tipoPag                      // 219-220: tipo inscrição
  r += N(cpfCnpj, 14)               // 221-234: CPF/CNPJ
  r += A(em.tomador_nome, 40)       // 235-274: nome
  r += A(logNum, 40)                // 275-314: endereço
  r += msg1                         // 315-326 (12 chars)
  r += N(cepRaw.slice(0, 5), 5)     // 327-331
  r += N(cepRaw.slice(5, 8), 3)     // 332-334
  r += msg2                         // 335-394 (60 chars)
  r += N(seq, 6)                    // 395-400

  if (r.length !== 400) throw new Error(`Transação: ${r.length} chars (esperado 400)`)
  return r
}

// ── Trailer (Registro 9) ──────────────────────────────────────
function buildTrailer(seq) {
  let r = '9' + ' '.repeat(393) + N(seq, 6)
  if (r.length !== 400) throw new Error(`Trailer: ${r.length} chars`)
  return r
}

// ── Supabase helper (fetch puro, sem SDK) ─────────────────────
async function supabaseFetch(url, key, path, method = 'GET', body) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      'Prefer':        method === 'GET' ? '' : 'return=minimal',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return res
}
