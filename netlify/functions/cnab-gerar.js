// Netlify Function — gera arquivo CNAB remessa (400 Bradesco ou 240 Viacredi/Banrisul)
// POST { userId, emissaoIds: [uuid, ...], contaId }
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

  const { userId, emissaoIds, contaId } = body
  if (!userId) return { statusCode: 400, body: JSON.stringify({ error: 'userId é obrigatório' }) }
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

  // cnab_config pode ser array (novo) ou objeto legado (Bradesco único)
  let contas = []
  const raw = profile.cnab_config
  if (Array.isArray(raw)) {
    contas = raw
  } else if (raw && typeof raw === 'object') {
    // legado: objeto único Bradesco
    contas = [{ id: 'legacy', banco: raw.banco || 'bradesco', label: 'Bradesco', ...raw }]
  }

  // Seleciona a conta
  let cc
  if (contaId) {
    cc = contas.find(c => c.id === contaId)
    if (!cc) return { statusCode: 422, body: JSON.stringify({ error: 'Conta bancária não encontrada.' }) }
  } else if (contas.length === 1) {
    cc = contas[0]
  } else if (contas.length === 0) {
    return { statusCode: 422, body: JSON.stringify({ error: 'Nenhuma conta bancária configurada em Configurações → Integrações.' }) }
  } else {
    return { statusCode: 422, body: JSON.stringify({ error: 'Selecione qual conta bancária usar para gerar o CNAB.' }) }
  }

  // Validações básicas
  if (!cc.agencia || !cc.conta) {
    return { statusCode: 422, body: JSON.stringify({ error: `Configure agência e conta para ${cc.label || cc.banco} em Configurações → Integrações.` }) }
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
    return { statusCode: 422, body: JSON.stringify({ error: 'Nenhuma nota com status "emitida" encontrada.' }) }
  }

  // ── Gera arquivo ──────────────────────────────────────────────
  const seqRemessa = cc.seq_remessa || 1
  const hoje       = new Date()
  const banco      = (cc.banco || 'bradesco').toLowerCase()

  let cnabText, totalTitulos, valorTotal

  if (banco === 'bradesco') {
    if (!cc.cod_empresa) {
      return { statusCode: 422, body: JSON.stringify({ error: 'Código da empresa Bradesco não configurado.' }) }
    }
    if (!cc.carteira) {
      return { statusCode: 422, body: JSON.stringify({ error: 'Carteira Bradesco não configurada.' }) }
    }
    ;({ cnabText, totalTitulos, valorTotal } = gerarCNAB400({ cc, profile, emissoes, seqRemessa, hoje }))
  } else {
    // Viacredi (085) ou Banrisul (041)
    ;({ cnabText, totalTitulos, valorTotal } = gerarCNAB240({ cc, profile, emissoes, seqRemessa, hoje, banco }))
  }

  // ── Incrementa seq_remessa ────────────────────────────────────
  const novasContas = contas.map(c =>
    c.id === cc.id ? { ...c, seq_remessa: seqRemessa + 1 } : c
  )
  await supabaseFetch(SUPABASE_URL, SERVICE_KEY,
    `profiles?id=eq.${userId}`, 'PATCH',
    { cnab_config: Array.isArray(raw) ? novasContas : { ...cc, seq_remessa: seqRemessa + 1 } }
  )

  // ── Nome do arquivo ───────────────────────────────────────────
  const dd   = String(hoje.getDate()).padStart(2, '0')
  const mm   = String(hoje.getMonth() + 1).padStart(2, '0')
  const seq2 = String(seqRemessa).padStart(2, '0').slice(-2)
  let filename

  if (banco === 'bradesco') {
    filename = `CB${dd}${mm}${seq2}.REM`
  } else if (banco === 'banrisul') {
    filename = `R${String(seqRemessa).padStart(7, '0')}.240`
  } else {
    filename = `REM${String(seqRemessa).padStart(7, '0')}.TXT`
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ cnabText, filename, totalTitulos, valorTotal }),
    headers: { 'Content-Type': 'application/json' },
  }
}

// ══════════════════════════════════════════════════════════════════
//  Helpers comuns
// ══════════════════════════════════════════════════════════════════
const A = (v, len) => String(v || '').toUpperCase().replace(/[\r\n]/g, ' ').slice(0, len).padEnd(len, ' ')
const N = (v, len) => String(v || '').replace(/\D/g, '').padStart(len, '0').slice(-len)

function fmtDataDDMMAAAA(date) {
  const d = date instanceof Date ? date : new Date(date)
  return String(d.getDate()).padStart(2, '0') +
         String(d.getMonth() + 1).padStart(2, '0') +
         String(d.getFullYear())
}

function fmtDataDDMMaa(date) {
  return fmtDataDDMMAAAA(date).slice(0, 6) + fmtDataDDMMAAAA(date).slice(8)
}

function fmtHoraHHMMSS(date) {
  const d = date instanceof Date ? date : new Date(date)
  return String(d.getHours()).padStart(2,'0') +
         String(d.getMinutes()).padStart(2,'0') +
         String(d.getSeconds()).padStart(2,'0')
}

function vencimento30dias(createdAt) {
  const d = new Date(createdAt || Date.now())
  d.setDate(d.getDate() + 30)
  return d
}

function parseCobData(em) {
  try {
    return typeof em.cob_data_json === 'string'
      ? JSON.parse(em.cob_data_json) : (em.cob_data_json || {})
  } catch { return {} }
}

function valorCents(v) {
  return Math.round(parseFloat(v || 0) * 100)
}

// ══════════════════════════════════════════════════════════════════
//  CNAB 400 — Bradesco
// ══════════════════════════════════════════════════════════════════
function gerarCNAB400({ cc, profile, emissoes, seqRemessa, hoje }) {
  const linhas = []
  let seq = 1

  linhas.push(buildHeader400({ cc, profile, seqRemessa, hoje, seq: seq++ }))
  let totalValor = 0
  emissoes.forEach((em, idx) => {
    const nossoNumero = N((em.numero_nfse || em.numero_dps || String(idx + 1)).replace(/\D/g, ''), 11)
    linhas.push(buildTransacao400({ cc, em, nossoNumero, hoje, seq: seq++ }))
    totalValor += parseFloat(em.valor_servico || 0)
  })
  linhas.push(buildTrailer400(seq))

  return {
    cnabText:    linhas.join('\r\n') + '\r\n',
    totalTitulos: emissoes.length,
    valorTotal:   totalValor,
  }
}

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

function identEmpresa(cc) {
  return '0' + N(cc.carteira, 3) + N(cc.agencia, 5) + N(cc.conta, 7) + (cc.conta_dv || '0')
}

function buildHeader400({ cc, profile, seqRemessa, hoje, seq }) {
  let r = ''
  r += '0'
  r += '1'
  r += 'REMESSA'
  r += '01'
  r += A('COBRANCA', 15)
  r += N(cc.cod_empresa, 20)
  r += A(profile.company_name || 'EMPRESA', 30)
  r += '237'
  r += A('BRADESCO', 15)
  r += fmtDataDDMMaa(hoje)
  r += ' '.repeat(8)
  r += 'MX'
  r += N(seqRemessa, 7)
  r += ' '.repeat(277)
  r += N(seq, 6)
  if (r.length !== 400) throw new Error(`Header400: ${r.length}`)
  return r
}

function buildTransacao400({ cc, em, nossoNumero, hoje, seq }) {
  const cd      = parseCobData(em)
  const dac     = calcDacNossoNumero(cc.carteira, nossoNumero)
  const venc    = vencimento30dias(em.created_at)
  const emDt    = new Date(em.created_at || hoje)
  const cpfCnpj = (cd.cpf || '').replace(/\D/g, '')
  const tipoPag = cpfCnpj.length <= 11 ? '01' : '02'
  const end     = cd.tomadorEnd || {}
  const logNum  = [end.logradouro, end.numero].filter(Boolean).join(', ')
  const cepRaw  = (end.cep || '').replace(/\D/g, '')
  const numDoc  = N((em.numero_nfse || em.numero_dps || '').replace(/\D/g, ''), 10)
  const msg1    = A('NFS-e ' + (em.numero_nfse || em.numero_dps || ''), 12)
  const msg2    = A(em.competencia || '', 60)

  let r = ''
  r += '1'
  r += ' '.repeat(19)
  r += identEmpresa(cc)                    // 021-037
  r += A(em.id || nossoNumero, 25)         // 038-062
  r += '000'                               // 063-065
  r += '0'                                 // 066
  r += '0000'                              // 067-070
  r += nossoNumero                         // 071-081
  r += dac                                 // 082
  r += '0'.repeat(10)                      // 083-092
  r += '2'                                 // 093
  r += 'N'                                 // 094
  r += ' '.repeat(10)                      // 095-104
  r += ' '                                 // 105
  r += ' '                                 // 106
  r += '00'                                // 107-108
  r += '01'                                // 109-110 ocorrência
  r += numDoc                              // 111-120
  r += fmtDataDDMMaa(venc)                 // 121-126
  r += String(valorCents(em.valor_servico)).padStart(13, '0') // 127-139
  r += '000'                               // 140-142
  r += '00000'                             // 143-147
  r += '12'                                // 148-149
  r += 'N'                                 // 150
  r += fmtDataDDMMaa(emDt)                 // 151-156
  r += '00'                                // 157-158
  r += '00'                                // 159-160
  r += '0'.repeat(13)                      // 161-173
  r += '000000'                            // 174-179
  r += '0'.repeat(13)                      // 180-192
  r += '0'.repeat(13)                      // 193-205
  r += '0'.repeat(13)                      // 206-218
  r += tipoPag                             // 219-220
  r += N(cpfCnpj, 14)                      // 221-234
  r += A(em.tomador_nome, 40)              // 235-274
  r += A(logNum, 40)                       // 275-314
  r += msg1                                // 315-326
  r += N(cepRaw.slice(0, 5), 5)            // 327-331
  r += N(cepRaw.slice(5, 8), 3)            // 332-334
  r += msg2                                // 335-394
  r += N(seq, 6)                           // 395-400
  if (r.length !== 400) throw new Error(`Transacao400: ${r.length}`)
  return r
}

function buildTrailer400(seq) {
  const r = '9' + ' '.repeat(393) + N(seq, 6)
  if (r.length !== 400) throw new Error(`Trailer400: ${r.length}`)
  return r
}

// ══════════════════════════════════════════════════════════════════
//  CNAB 240 — Viacredi (085) e Banrisul (041)
//  FEBRABAN padrão cobrança
// ══════════════════════════════════════════════════════════════════
const BANCO_INFO = {
  viacredi: { cod: '085', nome: 'VIACREDI', lotVer: '045', carteira: '01' },
  banrisul:  { cod: '041', nome: 'BANRISUL',  lotVer: '060', carteira: '01' },
  sicoob:   { cod: '756', nome: 'SICOOB',    lotVer: '045', carteira: '01' },
}

function gerarCNAB240({ cc, profile, emissoes, seqRemessa, hoje, banco }) {
  const info     = BANCO_INFO[banco] || BANCO_INFO.viacredi
  const cnpj     = N((profile.cnpj || '').replace(/\D/g, ''), 14)
  const empresa  = A(profile.company_name || 'EMPRESA', 30)
  const linhas   = []
  let seqGlobal  = 1     // seq arquivo (incrementa a cada registro)
  let seqLote    = 1     // seq dentro do lote
  let totalValor = 0

  // ── Header arquivo
  linhas.push(buildFileHeader240({ info, cnpj, empresa, cc, seqRemessa, hoje }))
  seqGlobal++

  // ── Lot header
  linhas.push(buildLotHeader240({ info, cnpj, empresa, cc, seqRemessa, hoje, lotVer: info.lotVer }))
  seqGlobal++

  // ── Segmentos P + Q por emissão
  emissoes.forEach((em, idx) => {
    const nn  = nossoNumero240(em, idx + 1, info.cod, cc)
    linhas.push(buildSegP240({ info, cc, em, nn, seqLote: seqLote++, hoje }))
    seqGlobal++
    linhas.push(buildSegQ240({ em, seqLote: seqLote++, banco: info.cod }))
    seqGlobal++
    totalValor += parseFloat(em.valor_servico || 0)
  })

  // ── Lot trailer
  const qtdReg = emissoes.length * 2 + 2  // P+Q + header+trailer do lote
  linhas.push(buildLotTrailer240({ info, qtdReg, totalTitulos: emissoes.length, valorTotal: totalValor }))
  seqGlobal++

  // ── File trailer
  linhas.push(buildFileTrailer240({ info, qtdLotes: 1, qtdRegistros: seqGlobal }))

  return {
    cnabText:    linhas.join('\r\n') + '\r\n',
    totalTitulos: emissoes.length,
    valorTotal:   totalValor,
  }
}

// Nosso número: campo 20 chars no CNAB 240
// Viacredi/AILOS (085): conta_7dig + DV_conta(1) + sequencial_9dig = 17 chars + 3 spaces
//   Ex: conta=2236959, DV=7, seq=162 → "22369597000000162   "
// Banrisul (041): sequencial_10dig + 10 spaces
//   Ex: seq=1743910 → "0001743910          "
function nossoNumero240(em, idx, codBanco, cc) {
  const seqRaw = (() => {
    const v = em.numero_nfse || em.numero_dps || String(idx)
    return typeof v === 'string' ? v.replace(/\D/g, '') : String(idx)
  })()

  if (codBanco === '085') {
    // Viacredi/AILOS: conta padded to 7 + DV_conta(1) + seq padded to 9
    const conta7  = N(cc.conta, 7)
    const dvConta = (cc.conta_dv || '0').slice(0, 1)
    const seq9    = N(seqRaw, 9)
    return (conta7 + dvConta + seq9).padEnd(20, ' ')  // 17 + 3 spaces
  }
  if (codBanco === '041') {
    // Banrisul: sequencial 10 dígitos + 10 spaces
    return N(seqRaw, 10).padEnd(20, ' ')
  }
  // Default: zeros(10) + sequencial(10)
  return '0'.repeat(10) + N(seqRaw, 10)
}

function buildFileHeader240({ info, cnpj, empresa, cc, seqRemessa, hoje }) {
  let r = ''
  r += info.cod                     // 001-003
  r += '0000'                       // 004-007
  r += '0'                          // 008
  r += ' '.repeat(9)                // 009-017
  r += '2'                          // 018 tipo inscrição CNPJ
  r += cnpj                         // 019-032 (14N)
  // 033-052: código convênio (20A) - agência+conta para identificação
  r += A(N(cc.agencia, 5) + N(cc.conta, 12), 20)  // 033-052
  r += N(cc.agencia, 5)             // 053-057
  r += A(cc.agencia_dv || ' ', 1)   // 058
  r += N(cc.conta, 12)              // 059-070
  r += A(cc.conta_dv || ' ', 1)     // 071
  r += ' '                          // 072 DV ag/conta
  r += empresa                      // 073-102
  r += A(info.nome, 30)             // 103-132
  r += ' '.repeat(10)               // 133-142
  r += '1'                          // 143 remessa
  r += fmtDataDDMMAAAA(hoje)        // 144-151
  r += fmtHoraHHMMSS(hoje)          // 152-157
  r += N(seqRemessa, 6)             // 158-163
  r += '084'                        // 164-166 versão layout
  r += '00000'                      // 167-171 densidade
  r += ' '.repeat(20)               // 172-191 reserva banco
  r += ' '.repeat(20)               // 192-211 reserva empresa
  r += ' '.repeat(29)               // 212-240
  if (r.length !== 240) throw new Error(`FileHeader240: ${r.length}`)
  return r
}

function buildLotHeader240({ info, cnpj, empresa, cc, seqRemessa, hoje, lotVer }) {
  let r = ''
  r += info.cod     // 001-003
  r += '0001'       // 004-007 lote 1
  r += '1'          // 008 tipo
  r += 'R'          // 009 operação remessa
  r += '01'         // 010-011 tipo serviço cobrança
  r += '  '         // 012-013 CNAB
  r += lotVer       // 014-016 versão layout lote
  r += ' '          // 017 CNAB
  r += '2'          // 018 tipo inscrição
  r += cnpj         // 019-032
  r += A(N(cc.agencia,5) + N(cc.conta, 12), 20) // 033-052 convênio
  r += N(cc.agencia, 5)           // 053-057
  r += A(cc.agencia_dv || ' ', 1) // 058
  r += N(cc.conta, 12)            // 059-070
  r += A(cc.conta_dv || ' ', 1)   // 071
  r += ' '                        // 072
  r += empresa                    // 073-102
  r += ' '.repeat(40)             // 103-142 informação livre
  r += fmtDataDDMMAAAA(hoje)      // 143-150 data gravação
  r += fmtDataDDMMAAAA(hoje)      // 151-158 data crédito (mesmo)
  r += fmtHoraHHMMSS(hoje)        // 159-164 hora
  r += N(seqRemessa, 8)           // 165-172 nº remessa
  r += ' '.repeat(68)             // 173-240
  if (r.length !== 240) throw new Error(`LotHeader240: ${r.length}`)
  return r
}

function buildSegP240({ info, cc, em, nn, seqLote, hoje }) {
  const cd       = parseCobData(em)
  const venc     = vencimento30dias(em.created_at)
  const emDt     = new Date(em.created_at || hoje)
  const carteira = cc.carteira || info.carteira || '01'
  const valor13  = String(valorCents(em.valor_servico)).padStart(13, '0')
  const numDoc   = A((em.numero_nfse || em.numero_dps || String(seqLote)).slice(0, 25), 25)

  let r = ''
  r += info.cod                    // 001-003
  r += '0001'                      // 004-007
  r += '3'                         // 008
  r += N(seqLote, 5)               // 009-013
  r += 'P'                         // 014
  r += ' '                         // 015
  r += '01'                        // 016-017 inclusão
  r += N(cc.agencia, 5)            // 018-022
  r += A(cc.agencia_dv || ' ', 1)  // 023
  r += N(cc.conta, 12)             // 024-035
  r += A(cc.conta_dv || ' ', 1)    // 036
  r += ' '                         // 037
  r += nn                          // 038-057 nosso número (20)
  r += N(carteira, 2)              // 058-059
  r += '1'                         // 060 tipo cobrança (simples)
  r += '2'                         // 061 forma emissão (cliente)
  r += 'N'                         // 062 permite instrução
  r += fmtDataDDMMAAAA(venc)       // 063-070 vencimento
  r += valor13                     // 071-083
  r += '00000'                     // 084-088 ag. cobradora
  r += ' '                         // 089
  r += '02'                        // 090-091 espécie DM
  r += 'N'                         // 092 aceite
  r += fmtDataDDMMAAAA(emDt)       // 093-100 emissão
  r += '3'                         // 101 mora isento
  r += '00000000'                  // 102-109 data mora
  r += '0'.repeat(13)              // 110-122 valor mora
  r += '0'                         // 123 desconto 1 tipo
  r += '00000000'                  // 124-131 data desconto 1
  r += '0'.repeat(13)              // 132-144 valor desconto 1
  r += '0'                         // 145 desconto 2 tipo
  r += '00000000'                  // 146-153
  r += '0'.repeat(13)              // 154-166
  r += '0'                         // 167 desconto 3
  r += '00000000'                  // 168-175
  r += '0'.repeat(13)              // 176-188
  r += '0'.repeat(13)              // 189-201 IOF
  r += '0'.repeat(13)              // 202-214 abatimento
  r += numDoc                      // 215-239
  r += ' '                         // 240
  if (r.length !== 240) throw new Error(`SegP240: ${r.length}`)
  return r
}

function buildSegQ240({ em, seqLote, banco }) {
  const cd       = parseCobData(em)
  const cpfCnpj  = (cd.cpf || cd.cnpj || '').replace(/\D/g, '')
  const tipoInsc = cpfCnpj.length <= 11 ? '1' : '2'
  const end      = cd.tomadorEnd || {}
  const logNum   = A([end.logradouro, end.numero].filter(Boolean).join(', '), 40)
  const bairro   = A(end.bairro || '', 15)
  const cepRaw   = (end.cep || '').replace(/\D/g, '')
  const cep8     = N(cepRaw, 8)
  const cidade   = A(end.municipio || end.cidade || '', 15)
  const uf       = A(end.uf || '', 2)

  let r = ''
  r += banco                        // 001-003
  r += '0001'                       // 004-007
  r += '3'                          // 008
  r += N(seqLote, 5)                // 009-013
  r += 'Q'                          // 014
  r += ' '                          // 015
  r += '01'                         // 016-017
  r += tipoInsc                     // 018
  r += N(cpfCnpj, 14)               // 019-032
  r += A(em.tomador_nome, 40)       // 033-072
  r += logNum                       // 073-112
  r += bairro                       // 113-127
  r += cep8                         // 128-135
  r += cidade                       // 136-150
  r += uf                           // 151-152
  r += '0'                          // 153 tipo sacador = 0 (sem)
  r += '0'.repeat(14)               // 154-167 CNPJ sacador
  r += A('', 40)                    // 168-207 nome sacador
  r += '000'                        // 208-210 banco correspondente
  r += '0'.repeat(20)               // 211-230 nosso número correspondente
  r += ' '.repeat(10)               // 231-240
  if (r.length !== 240) throw new Error(`SegQ240: ${r.length}`)
  return r
}

function buildLotTrailer240({ info, qtdReg, totalTitulos, valorTotal }) {
  // FEBRABAN CNAB 240 Lot Trailer layout
  // 018-023: Qtd registros lote (6N)
  // 024-029: Qtd títulos cobrança simples (6N)
  // 030-046: Valor total cobrança simples (17N)
  // 047-052: Qtd cobrança vinculada (6N) = 0
  // 053-069: Valor cobrança vinculada (17N) = 0
  // 070-075: Qtd cobrança caucionada (6N) = 0
  // 076-092: Valor caucionada (17N) = 0
  // 093-098: Qtd cobrança descontada (6N) = 0
  // 099-115: Valor descontada (17N) = 0
  // 116-121: Qtd cobrança desconto (6N) = 0
  // 122-138: Valor desconto (17N) = 0
  // 139-144: Qtd cobrança simples coobrigação (6N) = 0
  // 145-161: Valor simples coobrigação (17N) = 0
  // 162-169: Nº aviso bancário (8A)
  // 170-240: CNAB (71A)
  const valor17 = String(valorCents(valorTotal)).padStart(17, '0')
  let r = ''
  r += info.cod            // 001-003
  r += '0001'              // 004-007
  r += '5'                 // 008
  r += ' '.repeat(9)       // 009-017
  r += N(qtdReg, 6)        // 018-023
  r += N(totalTitulos, 6)  // 024-029
  r += valor17             // 030-046
  r += '000000'            // 047-052
  r += '0'.repeat(17)      // 053-069
  r += '000000'            // 070-075
  r += '0'.repeat(17)      // 076-092
  r += '000000'            // 093-098
  r += '0'.repeat(17)      // 099-115
  r += '000000'            // 116-121
  r += '0'.repeat(17)      // 122-138
  r += '000000'            // 139-144
  r += '0'.repeat(17)      // 145-161
  r += '        '          // 162-169 aviso
  r += ' '.repeat(71)      // 170-240
  if (r.length !== 240) throw new Error(`LotTrailer240: ${r.length}`)
  return r
}

function buildFileTrailer240({ info, qtdLotes, qtdRegistros }) {
  let r = ''
  r += info.cod         // 001-003
  r += '9999'           // 004-007
  r += '9'              // 008
  r += ' '.repeat(9)    // 009-017
  r += N(qtdLotes, 6)   // 018-023
  r += N(qtdRegistros, 6) // 024-029
  r += '000000'         // 030-035 qtd contas (não usado)
  r += ' '.repeat(205)  // 036-240
  if (r.length !== 240) throw new Error(`FileTrailer240: ${r.length}`)
  return r
}

// ── Supabase helper ───────────────────────────────────────────────
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
