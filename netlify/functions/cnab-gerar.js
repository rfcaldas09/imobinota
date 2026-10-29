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
// Normaliza acentos/cedilha para ASCII (CNAB exige 1 byte por char)
function toAscii(str) {
  return String(str || '')
    .normalize('NFD')                    // decompõe: Ç → C + ̧
    .replace(/[̀-ͯ]/g, '')     // remove diacríticos
    .replace(/[Çç]/g, c => c === 'Ç' ? 'C' : 'c')
    .replace(/[Ãã]/g, c => c === 'Ã' ? 'A' : 'a')
    .replace(/[Õõ]/g, c => c === 'Õ' ? 'O' : 'o')
    .replace(/[^A-Za-z0-9 .,:;/\\()\-_@#*+=%<>!?áéíóúàèìòùâêîôûäëïöüñ]/g, ' ')
}
const A = (v, len) => toAscii(v).toUpperCase().replace(/[\r\n]/g, ' ').slice(0, len).padEnd(len, ' ')
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
  viacredi: { cod: '085', nome: 'VIACREDI', lotVer: '045', carteira: '1' },
  banrisul:  { cod: '041', nome: 'BANRISUL',  lotVer: '060', carteira: '11' },
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

  // ── Segmentos P + Q (+ R opcional para multa) por emissão
  const temMulta = cc.multa_cod && cc.multa_cod !== '0'
  emissoes.forEach((em, idx) => {
    const nn  = nossoNumero240(em, idx + 1, info.cod, cc)
    linhas.push(buildSegP240({ info, cc, em, nn, seqLote: seqLote++, hoje }))
    seqGlobal++
    linhas.push(buildSegQ240({ em, seqLote: seqLote++, banco: info.cod }))
    seqGlobal++
    if (temMulta) {
      linhas.push(buildSegR240({ info, cc, seqLote: seqLote++ }))
      seqGlobal++
    }
    totalValor += parseFloat(em.valor_servico || 0)
  })

  // ── Lot trailer
  const segsPerTitulo = temMulta ? 3 : 2  // P+Q ou P+Q+R
  const qtdReg = emissoes.length * segsPerTitulo + 2  // segs + header+trailer do lote
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
  // Manual AILOS v14 – Seção 4.2.2.3 Registro Header de Lote
  let r = ''
  r += info.cod                    // 001-003
  r += '0001'                      // 004-007 lote 1
  r += '1'                         // 008 tipo registro
  r += 'R'                         // 009 operação remessa
  r += '01'                        // 010-011 tipo serviço cobrança
  r += '  '                        // 012-013 CNAB
  r += lotVer                      // 014-016 versão layout lote
  r += ' '                         // 017 CNAB
  r += '2'                         // 018 tipo inscrição CNPJ
  r += '0' + cnpj                  // 019-033 (15N: '0' + 14-digit CNPJ)
  r += A(cc.convenio || (N(cc.agencia, 5) + N(cc.conta, 12)), 20) // 034-053 convênio
  r += N(cc.agencia, 5)            // 054-058 agência
  r += A(cc.agencia_dv || ' ', 1)  // 059 DV agência
  r += N(cc.conta, 12)             // 060-071 conta
  r += A(cc.conta_dv || ' ', 1)    // 072 DV conta
  r += ' '                         // 073 DV ag/conta = branco
  r += empresa                     // 074-103 nome empresa (30A)
  r += ' '.repeat(40)              // 104-143 informação 1 = brancos
  r += ' '.repeat(40)              // 144-183 informação 2 = brancos
  r += N(seqRemessa, 8)            // 184-191 nº remessa (8N)
  r += fmtDataDDMMAAAA(hoje)       // 192-199 data gravação (8N)
  r += fmtDataDDMMAAAA(hoje)       // 200-207 data crédito (8N)
  r += ' '.repeat(33)              // 208-240 CNAB brancos
  if (r.length !== 240) throw new Error(`LotHeader240: ${r.length}`)
  return r
}

function buildSegP240({ info, cc, em, nn, seqLote, hoje }) {
  // Manual AILOS v14 – Seção 4.2.2.4 Registro Detalhe Segmento P (Remessa)
  const cd       = parseCobData(em)
  const venc     = vencimento30dias(em.created_at)
  const emDt     = new Date(em.created_at || hoje)
  const carteira = N(cc.carteira || info.carteira || '1', 1)  // 1 char
  const valor15  = String(valorCents(em.valor_servico)).padStart(15, '0')
  const nroDoc   = A((em.numero_nfse || em.numero_dps || String(seqLote)), 15)
  const usoEmp   = A((em.numero_nfse || em.numero_dps || ''), 25)

  // ── Instruções de cobrança configuráveis (cc.mora_cod, protesto, baixa)
  // Juros de mora: '3'=dispensado, '1'=valor/dia, '2'=taxa mensal
  const moraCod  = cc.mora_cod || '3'
  const moraVal  = moraCod !== '3'
    ? String(Math.round(parseFloat((cc.mora_val || '0').replace(',', '.')) * 100)).padStart(15, '0')
    : '0'.repeat(15)
  const moraData = moraCod !== '3' ? '00000000' : '00000000'  // aplica a partir do dia seguinte ao venc

  // Protesto: '0'=sem, '1'=protestar, '2'=negativar Serasa
  const protestoCod   = cc.protesto_cod || '0'
  const protestoPrazo = protestoCod !== '0'
    ? String(parseInt(cc.protesto_prazo || '5', 10)).padStart(2, '0').slice(-2)
    : '00'

  // Baixa: '0'=sem, '1'=baixar, '2'=devolver
  const baixaCod   = cc.baixa_cod || '0'
  const baixaPrazo = baixaCod !== '0'
    ? String(parseInt(cc.baixa_prazo || '30', 10)).padStart(3, '0').slice(-3)
    : '   '  // brancos quando sem baixa

  let r = ''
  r += info.cod                    // 001-003
  r += '0001'                      // 004-007
  r += '3'                         // 008
  r += N(seqLote, 5)               // 009-013
  r += 'P'                         // 014
  r += ' '                         // 015 CNAB
  r += '01'                        // 016-017 cód. movimento inclusão
  r += N(cc.agencia, 5)            // 018-022 agência
  r += A(cc.agencia_dv || ' ', 1)  // 023 DV ag
  r += N(cc.conta, 12)             // 024-035 conta
  r += A(cc.conta_dv || ' ', 1)    // 036 DV conta
  r += ' '                         // 037 DV ag/conta
  r += nn                          // 038-057 nosso número (20A)
  r += carteira                    // 058 carteira (1N)
  r += '1'                         // 059 tipo cadastramento (1=Cobrança Simples)
  r += '1'                         // 060 tipo documento (default '1')
  r += '2'                         // 061 emissão boleto (2=cliente emite)
  r += '2'                         // 062 distribuição boleto (2=cliente distribui)
  r += nroDoc                      // 063-077 nº documento (15A, left-aligned)
  r += fmtDataDDMMAAAA(venc)       // 078-085 vencimento (8N)
  r += valor15                     // 086-100 valor nominal (15N, 2 dec implícitos)
  r += '00000'                     // 101-105 ag. cobradora (zeros)
  r += ' '                         // 106 DV ag. cobradora (branco)
  r += '00'                        // 107-108 espécie documento
  r += 'N'                         // 109 aceite (N = não aceite)
  r += fmtDataDDMMAAAA(emDt)       // 110-117 data emissão (8N)
  r += moraCod                     // 118 cód. mora
  r += moraData                    // 119-126 data início mora
  r += moraVal                     // 127-141 valor/taxa mora (15N)
  r += '0'                         // 142 cód. desconto 1 (0 = sem desconto)
  r += '00000000'                  // 143-150 data desconto 1
  r += '0'.repeat(15)              // 151-165 valor desconto 1 (15N)
  r += '0'.repeat(15)              // 166-180 IOF (15N)
  r += '0'.repeat(15)              // 181-195 abatimento (15N)
  r += usoEmp                      // 196-220 uso empresa cedente (25A)
  r += protestoCod                 // 221 cód. protesto
  r += protestoPrazo               // 222-223 prazo protesto
  r += baixaCod                    // 224 cód. baixa/devolução
  r += baixaPrazo                  // 225-227 prazo baixa (3A ou brancos)
  r += '09'                        // 228-229 código moeda (09 = Real)
  r += '0'.repeat(10)              // 230-239 nº contrato (zeros)
  r += ' '                         // 240 uso livre
  if (r.length !== 240) throw new Error(`SegP240: ${r.length}`)
  return r
}

function buildSegQ240({ em, seqLote, banco }) {
  // Manual AILOS v14 – Seção 4.2.2.5 Registro Detalhe Segmento Q (Remessa)
  const cd       = parseCobData(em)
  const cpfCnpj  = (cd.cpf || cd.cnpj || '').replace(/\D/g, '')
  const tipoInsc = cpfCnpj.length <= 11 ? '1' : '2'
  const end      = cd.tomadorEnd || {}
  const logNum   = A([end.logradouro, end.numero].filter(Boolean).join(', '), 40)
  const bairro   = A(end.bairro || '', 15)
  const cepRaw   = (end.cep || '').replace(/\D/g, '')
  const cep5     = N(cepRaw.slice(0, 5), 5)
  const cepSuf   = N(cepRaw.slice(5, 8), 3)
  const cidade   = A(end.municipio || end.cidade || '', 15)
  const uf       = A(end.uf || '', 2)

  let r = ''
  r += banco                        // 001-003
  r += '0001'                       // 004-007
  r += '3'                          // 008
  r += N(seqLote, 5)                // 009-013
  r += 'Q'                          // 014
  r += ' '                          // 015 CNAB
  r += '01'                         // 016-017 cód. movimento
  r += tipoInsc                     // 018 tipo inscrição (1=CPF, 2=CNPJ)
  r += N(cpfCnpj, 15)               // 019-033 número inscrição (15N)
  r += A(em.tomador_nome, 40)       // 034-073 nome (40A)
  r += logNum                       // 074-113 endereço (40A)
  r += bairro                       // 114-128 bairro (15A)
  r += cep5                         // 129-133 CEP (5N)
  r += cepSuf                       // 134-136 sufixo CEP (3N)
  r += cidade                       // 137-151 cidade (15A)
  r += uf                           // 152-153 UF (2A)
  r += '0'                          // 154 tipo sacador/avalista = 0 (sem)
  r += '0'.repeat(15)               // 155-169 CNPJ sacador/avalista (15N zeros)
  r += A('', 40)                    // 170-209 nome sacador/avalista (40A brancos)
  r += '000'                        // 210-212 banco correspondente (3N zeros)
  r += ' '.repeat(20)               // 213-232 nosso num banco corresp (20A brancos)
  r += ' '.repeat(8)                // 233-240 CNAB brancos (8A)
  if (r.length !== 240) throw new Error(`SegQ240: ${r.length}`)
  return r
}

function buildSegR240({ info, cc, seqLote }) {
  // Manual AILOS v14 – Seção 4.2.2.6 Registro Detalhe Segmento R (Opcional – Multa)
  // Campos G073 (cód multa), G074 (data multa), G075 (valor/percentual multa)
  const multaCod = cc.multa_cod || '0'   // '1'=valor fixo, '2'=percentual
  const multaVal = multaCod !== '0'
    ? String(Math.round(parseFloat((cc.multa_val || '0').replace(',', '.')) * 100)).padStart(15, '0')
    : '0'.repeat(15)
  const multaData = '00000000'  // sem data = assume vencimento do título

  let r = ''
  r += info.cod                // 001-003 banco
  r += '0001'                  // 004-007 lote
  r += '3'                     // 008 tipo registro detalhe
  r += N(seqLote, 5)           // 009-013 seq no lote
  r += 'R'                     // 014 segmento
  r += ' '                     // 015 CNAB branco
  r += '01'                    // 016-017 cód. movimento remessa
  r += '0'                     // 018 cód. desconto 2 (0=sem)
  r += '00000000'              // 019-026 data desconto 2
  r += '0'.repeat(15)          // 027-041 valor desconto 2 (13N+2dec)
  r += '0'                     // 042 cód. desconto 3 (0=sem)
  r += '00000000'              // 043-050 data desconto 3
  r += '0'.repeat(15)          // 051-065 valor desconto 3 (13N+2dec)
  r += multaCod                // 066 código da multa (G073)
  r += multaData               // 067-074 data da multa (G074)
  r += multaVal                // 075-089 valor/percentual multa (G075, 13N+2dec)
  r += ' '.repeat(10)          // 090-099 informação ao sacado (C036)
  r += ' '.repeat(40)          // 100-139 mensagem 3 (C037)
  r += ' '.repeat(40)          // 140-179 mensagem 4 (C037)
  r += ' '.repeat(20)          // 180-199 CNAB brancos
  r += '00000000'              // 200-207 cód. ocorrência sacado (C038)
  r += '000'                   // 208-210 banco débito
  r += '00000'                 // 211-215 agência débito
  r += ' '                     // 216 DV agência débito
  r += '0'.repeat(12)          // 217-228 conta débito
  r += ' '                     // 229 DV conta débito
  r += ' '                     // 230 DV ag/conta
  r += '0'                     // 231 ident. emissão aviso débito
  r += ' '.repeat(9)           // 232-240 CNAB brancos
  if (r.length !== 240) throw new Error(`SegR240: ${r.length}`)
  return r
}

function buildLotTrailer240({ info, qtdReg, totalTitulos, valorTotal }) {
  // Manual AILOS v14 – Seção 4.2.2.3.1 Registro Trailer do Lote
  // 018-023: Qtd registros lote (6N)
  // 024-029: Qtd títulos cobrança simples (6N)
  // 030-046: Valor total cobrança simples (17N = 15 dig + 2 dec)
  // 047-052: Qtd cobrança vinculada (6N) = 0
  // 053-069: Valor cobrança vinculada (17N) = 0
  // 070-075: Qtd cobrança caucionada (6N) = 0
  // 076-092: Valor cobrança caucionada (17N) = 0
  // 093-098: Qtd cobrança descontada (6N) = 0
  // 099-115: Valor cobrança descontada (17N) = 0
  // 116-123: Nº aviso de lançamento (8A)
  // 124-240: CNAB brancos (117A)
  const valor17 = String(valorCents(valorTotal)).padStart(17, '0')
  let r = ''
  r += info.cod            // 001-003
  r += '0001'              // 004-007
  r += '5'                 // 008
  r += ' '.repeat(9)       // 009-017
  r += N(qtdReg, 6)        // 018-023
  r += N(totalTitulos, 6)  // 024-029
  r += valor17             // 030-046 valor total simples (17N)
  r += '000000'            // 047-052 qtd vinculada
  r += '0'.repeat(17)      // 053-069 valor vinculada
  r += '000000'            // 070-075 qtd caucionada
  r += '0'.repeat(17)      // 076-092 valor caucionada
  r += '000000'            // 093-098 qtd descontada
  r += '0'.repeat(17)      // 099-115 valor descontada
  r += '        '          // 116-123 nº aviso lançamento (8A brancos)
  r += ' '.repeat(117)     // 124-240 CNAB brancos
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
