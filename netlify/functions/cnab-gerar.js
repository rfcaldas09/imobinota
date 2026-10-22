// Netlify Function — gera arquivo CNAB 400 Bradesco (remessa)
// POST { userId, emissaoIds: [uuid, ...] }
// Retorna { cnabText, filename, totalTitulos, valorTotal }

const { createClient } = require('@supabase/supabase-js')

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
  const SUPABASE_URL  = process.env.SUPABASE_URL
  const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase não configurado' }) }
  }

  // ── Auth: verifica JWT do usuário ──────────────────────────────
  const authHeader = event.headers?.authorization || event.headers?.Authorization || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return { statusCode: 401, body: JSON.stringify({ error: 'Token não fornecido' }) }

  const supaUser = createClient(SUPABASE_URL, jwt, { auth: { persistSession: false } })
  const { data: { user }, error: authErr } = await supaUser.auth.getUser()
  if (authErr || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Não autenticado' }) }

  const body = JSON.parse(event.body || '{}')
  const { userId, emissaoIds } = body

  if (!userId || userId !== user.id) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Acesso negado' }) }
  }
  if (!Array.isArray(emissaoIds) || emissaoIds.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'emissaoIds é obrigatório' }) }
  }

  // ── Busca perfil + cnab_config ────────────────────────────────
  const supaAdmin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: profileArr } = await supaAdmin
    .from('profiles')
    .select('company_name, cnpj, cnab_config')
    .eq('id', userId)
    .limit(1)

  const profile = profileArr?.[0] || {}
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
  const { data: emissoes, error: emErr } = await supaAdmin
    .from('nfse_emissoes')
    .select('id, numero_nfse, numero_dps, tomador_nome, valor_servico, created_at, competencia, cob_data_json')
    .in('id', emissaoIds)
    .eq('user_id', userId)
    .eq('status', 'emitida')

  if (emErr) throw new Error(`Erro ao buscar emissões: ${emErr.message}`)
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
  await supaAdmin
    .from('profiles')
    .update({ cnab_config: novaConfig })
    .eq('id', userId)

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

  // ── Header ───────────────────────────────────────────────────
  linhas.push(buildHeader({ cc, profile, seqRemessa, hoje, seq: seq++ }))

  // ── Transações tipo 1 ─────────────────────────────────────────
  let totalValor = 0
  emissoes.forEach((em, idx) => {
    const nossoNumero = nossoNumeroStr(em, idx + 1)
    const linha = buildTransacao1({ cc, profile, em, nossoNumero, hoje, seq: seq++ })
    linhas.push(linha)
    totalValor += parseFloat(em.valor_servico || 0)
  })

  // ── Trailer ───────────────────────────────────────────────────
  linhas.push(buildTrailer(seq))

  const cnabText = linhas.join('\r\n') + '\r\n'
  return { cnabText, totalTitulos: emissoes.length, valorTotal: totalValor }
}

// ── Helpers de formatação ─────────────────────────────────────
// Alfanumérico: alinha esquerda, preenche espaço à direita
const A = (v, len) => String(v || '').toUpperCase().replace(/[\r\n]/g, ' ').slice(0, len).padEnd(len, ' ')
// Numérico: alinha direita, preenche zero à esquerda
const N = (v, len) => String(v || '').replace(/\D/g, '').padStart(len, '0').slice(-len)

function fmtDataDDMMaa(date) {
  const d = date instanceof Date ? date : new Date(date)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const aa = String(d.getFullYear()).slice(2)
  return dd + mm + aa
}

// Vencimento: emissão + 30 dias (boleto para pagamento)
function calcVencimento(emCreatedAt) {
  const d = new Date(emCreatedAt || Date.now())
  d.setDate(d.getDate() + 30)
  return d
}

// Valor: R$ com 2 casas decimais, sem separadores, 13 dígitos
function fmtValor13(v) {
  const cents = Math.round(parseFloat(v || 0) * 100)
  return String(cents).padStart(13, '0')
}

// DAC (dígito de autoconferência) do Nosso Número — módulo 11 base 7
// Entrada: carteira (3 chars) + nossoNumero (11 chars) = 14 chars
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

// Derive o Nosso Número a partir do numero_nfse (até 11 dígitos numéricos)
function nossoNumeroStr(em, fallbackIdx) {
  const raw = (em.numero_nfse || em.numero_dps || String(fallbackIdx)).replace(/\D/g, '')
  return N(raw, 11)
}

// Identificação empresa beneficiária (posições 021-037, 17 chars)
// Formato: '0' + carteira(3) + agência(5) + conta(7) + dígito_conta(1)
function identEmpresa(cc) {
  return '0' + N(cc.carteira, 3) + N(cc.agencia, 5) + N(cc.conta, 7) + (cc.conta_dv || '0')
}

// Extrai CPF/CNPJ do cob_data_json
function parseCobData(em) {
  try {
    const cd = typeof em.cob_data_json === 'string'
      ? JSON.parse(em.cob_data_json)
      : (em.cob_data_json || {})
    return cd
  } catch { return {} }
}

// ── Header Label (Registro 0) ─────────────────────────────────
function buildHeader({ cc, profile, seqRemessa, hoje, seq }) {
  let r = ''
  r += '0'                                          // 001: Identificação registro
  r += '1'                                          // 002: Arquivo remessa
  r += 'REMESSA'                                    // 003-009
  r += '01'                                         // 010-011: Código serviço
  r += A('COBRANCA', 15)                            // 012-026
  r += N(cc.cod_empresa, 20)                        // 027-046: Código empresa (fornecido pelo Bradesco)
  r += A(profile.company_name || 'EMPRESA', 30)     // 047-076: Nome empresa
  r += '237'                                        // 077-079: Bradesco
  r += A('BRADESCO', 15)                            // 080-094
  r += fmtDataDDMMaa(hoje)                          // 095-100: Data gravação
  r += ' '.repeat(8)                                // 101-108: Branco
  r += 'MX'                                         // 109-110: Sistema
  r += N(seqRemessa, 7)                             // 111-117: Nº sequencial remessa
  r += ' '.repeat(277)                              // 118-394: Branco
  r += N(seq, 6)                                    // 395-400: Nº sequencial registro

  if (r.length !== 400) throw new Error(`Header inválido: ${r.length} chars (esperado 400)`)
  return r
}

// ── Registro de Transação Tipo 1 ─────────────────────────────
function buildTransacao1({ cc, profile, em, nossoNumero, hoje, seq }) {
  const cd    = parseCobData(em)
  const dac   = calcDacNossoNumero(cc.carteira, nossoNumero)
  const venc  = calcVencimento(em.created_at)
  const emDt  = new Date(em.created_at || hoje)

  // CPF/CNPJ do pagador
  const cpfCnpj  = (cd.cpf || '').replace(/\D/g, '')
  const tipoPag  = cpfCnpj.length <= 11 ? '01' : '02'

  // Endereço do pagador
  const end     = cd.tomadorEnd || {}
  const logNum  = [end.logradouro, end.numero].filter(Boolean).join(', ')
  const cepRaw  = (end.cep || '').replace(/\D/g, '')
  const cep5    = cepRaw.slice(0, 5)
  const cep3    = cepRaw.slice(5, 8)

  // Número do documento (nr da NFS-e ou DPS, 10 chars)
  const numDoc = N((em.numero_nfse || em.numero_dps || '').replace(/\D/g, ''), 10)

  // 1ª mensagem: "NFS-e " + numero (12 chars)
  const msg1 = A('NFS-e ' + (em.numero_nfse || em.numero_dps || ''), 12)
  // 2ª mensagem: competência (60 chars)
  const msg2 = A(em.competencia || '', 60)

  let r = ''
  r += '1'                                          // 001: Tipo registro
  r += ' '.repeat(19)                               // 002-020: Débito automático (não usado)
  r += identEmpresa(cc)                             // 021-037: Identificação empresa (17 chars)
  r += A(em.id || nossoNumero, 25)                  // 038-062: Nº controle participante
  r += '000'                                        // 063-065: Banco débito (zeros = sem débito auto)
  r += '0'                                          // 066: Multa (0 = sem multa)
  r += '0000'                                       // 067-070: Percentual multa
  r += nossoNumero                                  // 071-081: Nosso número (11 chars)
  r += dac                                          // 082: DAC nosso número
  r += '0'.repeat(10)                               // 083-092: Desconto bonif/dia (zeros)
  r += '2'                                          // 093: Condição emissão (2 = cliente emite)
  r += 'N'                                          // 094: Débito automático (N = não)
  r += ' '.repeat(10)                               // 095-104: Operação banco (brancos)
  r += ' '                                          // 105: Indicador rateio
  r += ' '                                          // 106: Endereçamento débito auto
  r += '00'                                         // 107-108: Qtd pagamentos
  r += '01'                                         // 109-110: Ocorrência (01 = entrada de título)
  r += numDoc                                       // 111-120: Nº documento (10 chars)
  r += fmtDataDDMMaa(venc)                          // 121-126: Vencimento (DDMMAA)
  r += fmtValor13(em.valor_servico)                 // 127-139: Valor título (13 chars)
  r += '000'                                        // 140-142: Banco cobrança (zeros)
  r += '00000'                                      // 143-147: Agência depositária (zeros)
  r += '12'                                         // 148-149: Espécie (12 = duplicata de serviço)
  r += 'N'                                          // 150: Identificação
  r += fmtDataDDMMaa(emDt)                          // 151-156: Data emissão
  r += '00'                                         // 157-158: 1ª instrução
  r += '00'                                         // 159-160: 2ª instrução
  r += '0'.repeat(13)                               // 161-173: Mora por dia (zeros)
  r += '000000'                                     // 174-179: Data limite desconto
  r += '0'.repeat(13)                               // 180-192: Valor desconto
  r += '0'.repeat(13)                               // 193-205: Valor IOF
  r += '0'.repeat(13)                               // 206-218: Valor abatimento
  r += tipoPag                                      // 219-220: Tipo inscrição pagador
  r += N(cpfCnpj, 14)                               // 221-234: CPF/CNPJ pagador
  r += A(em.tomador_nome, 40)                       // 235-274: Nome pagador
  r += A(logNum, 40)                                // 275-314: Endereço
  r += msg1                                         // 315-326: 1ª mensagem
  r += N(cep5, 5)                                   // 327-331: CEP
  r += N(cep3, 3)                                   // 332-334: Sufixo CEP
  r += msg2                                         // 335-394: 2ª mensagem (60 chars)
  r += N(seq, 6)                                    // 395-400: Sequencial

  if (r.length !== 400) throw new Error(`Transação inválida: ${r.length} chars (esperado 400)`)
  return r
}

// ── Trailer (Registro 9) ──────────────────────────────────────
function buildTrailer(seq) {
  let r = ''
  r += '9'                                          // 001
  r += ' '.repeat(393)                              // 002-394: Brancos
  r += N(seq, 6)                                    // 395-400: Nº sequencial do último registro

  if (r.length !== 400) throw new Error(`Trailer inválido: ${r.length} chars (esperado 400)`)
  return r
}
