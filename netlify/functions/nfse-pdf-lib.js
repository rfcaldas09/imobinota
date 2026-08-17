'use strict'

// Gerador de PDF NFS-e — layout compatível com NFS-e municipal (Blumenau/SC)
// Usa PDFKit + qrcode. Sem imagens de brasão/logo.

const PDFDocument = require('pdfkit/js/pdfkit.standalone.js')
const QRCode      = require('qrcode')

// ── Lookup IBGE (2 primeiros dígitos) → UF ───────────────────────
const IBGE_UF = {
  '11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO',
  '21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA',
  '31':'MG','32':'ES','33':'RJ','35':'SP',
  '41':'PR','42':'SC','43':'RS',
  '50':'MS','51':'MT','52':'GO','53':'DF',
}

// ── Lookup LC 116/2003: código → descrição (enquadramento) ────────
const LC116_MAP = {
  '1.01':'Análise e desenvolvimento de sistemas',
  '1.02':'Programação',
  '1.03':'Processamento, armazenamento ou hospedagem de dados, textos, imagens, vídeos, páginas eletrônicas, aplicativos e sistemas de informação',
  '1.04':'Elaboração de programas de computadores, inclusive de jogos eletrônicos',
  '1.05':'Licenciamento ou cessão de direito de uso de programas de computação',
  '1.06':'Assessoria e consultoria em informática',
  '1.07':'Suporte técnico em informática, inclusive instalação, configuração e manutenção de programas e bancos de dados',
  '1.08':'Planejamento, confecção, manutenção e atualização de páginas eletrônicas',
  '1.09':'Disponibilização de conteúdos de áudio, vídeo, imagem e texto por meio da internet (streaming)',
  '2.01':'Serviços de pesquisas e desenvolvimento de qualquer natureza',
  '4.01':'Medicina e biomedicina',
  '4.02':'Análises clínicas, patologia, eletricidade médica, radioterapia, quimioterapia, ultrassonografia, ressonância magnética, radiologia, tomografia e congêneres',
  '4.03':'Hospitais, clínicas, laboratórios, sanatórios, manicômios, casas de saúde, prontos-socorros, ambulatórios e congêneres',
  '4.05':'Acupuntura',
  '4.06':'Enfermagem, inclusive serviços auxiliares',
  '4.08':'Terapia ocupacional, fisioterapia e fonoaudiologia',
  '4.09':'Terapias de qualquer espécie destinadas ao tratamento físico, orgânico e mental',
  '4.12':'Odontologia',
  '4.15':'Psicanálise',
  '4.16':'Psicologia',
  '4.22':'Planos de medicina de grupo ou individual e convênios para prestação de assistência médica, hospitalar, odontológica e congêneres',
  '4.23':'Outros planos de saúde que se cumpram mediante serviços de terceiros contratados, credenciados, cooperados ou pagos pelo operador',
  '5.01':'Medicina veterinária e zootecnia',
  '6.01':'Barbearia, cabeleireiros, manicuros, pedicuros e congêneres',
  '6.02':'Esteticistas, tratamento de pele, depilação e congêneres',
  '6.04':'Ginástica, dança, esportes, natação, artes marciais e demais atividades físicas',
  '7.01':'Ensino regular pré-escolar, fundamental, médio e superior',
  '7.02':'Instrução, treinamento, orientação pedagógica e educacional, avaliação de conhecimentos de qualquer natureza',
  '7.03':'Elaboração e ministração de cursos e aulas de qualquer natureza',
  '8.01':'Hotéis, apart-hotéis, flat, hotéis residência, motéis, pensões e congêneres',
  '8.02':'Agenciamento, organização, promoção, intermediação e execução de programas de turismo, passeios, viagens, excursões, hospedagens e congêneres',
  '8.03':'Guias de turismo',
  '9.01':'Agenciamento, corretagem ou intermediação de câmbio, seguros, cartões de crédito, planos de saúde e previdência privada',
  '9.02':'Agenciamento, corretagem ou intermediação de títulos em geral, valores mobiliários e contratos quaisquer',
  '9.05':'Agenciamento, corretagem ou intermediação de bens móveis ou imóveis, não abrangidos em outros itens desta lista',
  '10.01':'Guarda e estacionamento de veículos terrestres automotores, de aeronaves e de embarcações',
  '10.02':'Vigilância, segurança ou monitoramento de bens e pessoas',
  '10.04':'Armazenamento, depósito, carga, descarga, arrumação e guarda de bens de qualquer espécie',
  '10.09':'Administração de bens e negócios de terceiros',
  '14.01':'Lubrificação, limpeza, lustração, revisão, carga e recarga, conserto, restauração, manutenção e conservação de máquinas, veículos, aparelhos e equipamentos',
  '14.02':'Assistência técnica',
  '14.06':'Instalação e montagem de aparelhos, máquinas e equipamentos, inclusive montagem industrial',
  '15.01':'Administração de fundos quaisquer, de consórcio, de cartão de crédito ou débito e congêneres',
  '16.01':'Serviços de transporte coletivo municipal rodoviário, metroviário, ferroviário e aquaviário de passageiros',
  '16.02':'Outros serviços de transporte de natureza municipal',
  '17.01':'Assessoria ou consultoria de qualquer natureza',
  '17.04':'Contabilidade, inclusive serviços técnicos e auxiliares',
  '17.05':'Advocacia',
  '17.07':'Auditoria',
  '17.17':'Engenharia, arquitetura, geologia, urbanismo, construção civil, manutenção, limpeza, meio ambiente, saneamento e congêneres',
  '21.01':'Serviços de registros públicos, cartorários e notariais',
  '26.01':'Serviços de coleta, remessa ou entrega de correspondências, documentos, objetos, bens ou valores, inclusive pelos correios',
  '27.01':'Serviços de assistência social',
  '28.01':'Serviços de avaliação de bens e serviços de qualquer natureza',
  '31.01':'Serviços técnicos em edificações, eletrônica, eletrotécnica, mecânica, telecomunicações e congêneres',
  '33.01':'Serviços de desembaraço aduaneiro, comissários, despachantes e congêneres',
  '35.01':'Serviços de reportagem, assessoria de imprensa, jornalismo e relações públicas',
  '37.01':'Serviços de artistas, atletas, modelos e manequins',
}

// ── Constantes de layout ──────────────────────────────────────────
const PL  = 28        // margem esquerda
const W   = 539       // largura do conteúdo (595 - 56)
const PR  = PL + W    // borda direita
const BLK = '#000000'
const DRK = '#222222'
const GRY = '#CCCCCC' // fundo dos cabeçalhos de seção

// ── Exportações ───────────────────────────────────────────────────
module.exports = { buildNfsePdf, extrairCamposPdf }

// ── buildNfsePdf ─────────────────────────────────────────────────
async function buildNfsePdf(f) {
  let qrBuf = null
  try {
    const qrUrl = f.chave
      ? `https://www.nfse.gov.br/consultapublica?chave=${f.chave}`
      : 'https://www.nfse.gov.br/consultapublica'
    qrBuf = await QRCode.toBuffer(qrUrl, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 200 })
  } catch (e) {
    console.warn('[nfse-pdf-lib] QR code error:', e.message)
  }

  return new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument({ size: 'A4', margins: { top: 0, left: 0, right: 0, bottom: 0 } })
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    try {
      renderPage(doc, f, qrBuf)
      doc.end()
    } catch (e) { reject(e) }
  })
}

// ── Renderização da página ────────────────────────────────────────
function renderPage(doc, f, qrBuf) {
  // Primitivos de desenho
  const hline = (y0, x0 = PL, len = W) =>
    doc.moveTo(x0, y0).lineTo(x0 + len, y0).lineWidth(0.5).strokeColor(BLK).stroke()

  const vline = (x0, y0, h) =>
    doc.moveTo(x0, y0).lineTo(x0, y0 + h).lineWidth(0.5).strokeColor(BLK).stroke()

  const box = (x, y, w, h) =>
    doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(BLK).stroke()

  const fill = (x, y, w, h, color = GRY) =>
    doc.rect(x, y, w, h).fillColor(color).fill()

  // Texto com posição absoluta — sempre fornecer x,y,w
  const t = (text, x, y0, w, { bold = false, size = 7, align = 'left', color = BLK } = {}) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
       .fontSize(size)
       .fillColor(color)
       .text(String(text ?? ''), x, y0, { width: w, align, lineBreak: false, continued: false })
  }

  const lbl = (text, x, y0, w = 200) => t(text, x, y0, w, { bold: true, color: DRK })
  const val = (text, x, y0, w = 200) => t(text, x, y0, w, { bold: false })

  // Cabeçalho de seção (barra cinza)
  const secHdr = (label, y0) => {
    fill(PL, y0, W, 13)
    t(label, PL, y0 + 3, W, { bold: true, size: 8, align: 'center', color: DRK })
    return y0 + 13
  }

  let y = 25

  // ── BLOCO CABEÇALHO ───────────────────────────────────────────
  const HDR_H = 78
  box(PL, y, W, HDR_H)

  // Coluna direita: caixa com número da nota
  const RCW = 140
  const RCX = PR - RCW
  vline(RCX, y, HDR_H)
  t('Número da Nota Fiscal', RCX + 3, y + 4,  RCW - 6, { size: 7, align: 'center' })
  t(String(f.numero || ''), RCX + 3, y + 14, RCW - 6, { bold: true, size: 22, align: 'center' })
  t(`Série: ${f.serie || 'E'}`, RCX + 3, y + 39, RCW - 6, { size: 7 })
  t(`Data Emissão: ${fmtDate(f.dhEmi)}`, RCX + 3, y + 49, RCW - 6, { size: 7 })
  t('Certificação:', RCX + 3, y + 59, RCW - 6, { size: 7 })
  t(f.certificacao || '', RCX + 3, y + 68, RCW - 6, { bold: true, size: 7 })

  // Coluna central: QR code (70×70)
  const QRS  = 68
  const QRX  = RCX - QRS - 8
  if (qrBuf) {
    // Standalone pdfkit usa Buffer polyfill — passa como data URI para garantir compatibilidade
    const qrSrc = 'data:image/png;base64,' + qrBuf.toString('base64')
    doc.image(qrSrc, QRX, y + 5, { width: QRS, height: QRS })
  }

  // Coluna esquerda: informações municipais
  const LCW = QRX - PL - 4
  let lhy = y + 7
  t(f.municipioNome || 'MUNICÍPIO DE BLUMENAU',           PL + 2, lhy,      LCW, { bold: true, size: 8.5, align: 'center' })
  t('SECRETARIA MUNICIPAL DA FAZENDA',                     PL + 2, lhy + 12, LCW, { bold: true, size: 7.5, align: 'center' })
  t('DIRETORIA GERAL',                                     PL + 2, lhy + 22, LCW, { bold: true, size: 7.5, align: 'center' })
  t('DIRETORIA DE RECEITA',                                PL + 2, lhy + 32, LCW, { bold: true, size: 7.5, align: 'center' })
  t('NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-E',         PL + 2, lhy + 44, LCW, { bold: true, size: 8.5, align: 'center' })

  y += HDR_H

  // ── DADOS DO PRESTADOR ────────────────────────────────────────
  y = secHdr('DADOS DO PRESTADOR', y)
  let ry = y + 2

  lbl('Nome/Razão Social:',   PL + 2,  ry, 80); val(f.prestadorNome,     PL + 84,  ry, 185)
  lbl('Nome Fantasia:',       PL + 280, ry, 65); val(f.prestadorFantasia, PL + 347, ry, 180)
  ry += 11

  lbl('CNPJ/CPF:',            PL + 2,   ry, 40); val(f.prestadorCnpj,    PL + 44,  ry, 115)
  lbl('Insc. Municipal:',     PL + 162, ry, 68); val(f.prestadorInscMun, PL + 232, ry,  45)
  lbl('Insc. Estadual:',      PL + 280, ry, 62)
  lbl('N°:',                  PL + 395, ry, 15); val(f.prestadorNumero,  PL + 412, ry,  55)
  lbl('Compl.:',              PL + 471, ry, 32); val(f.prestadorCompl,   PL + 505, ry,  60)
  ry += 11

  lbl('Endereço:',            PL + 2,   ry, 42); val(f.prestadorEnd,     PL + 46,  ry, 240)
  lbl('UF:',                  PL + 292, ry, 16); val(f.prestadorUF,         PL + 310, ry, 30)
  lbl('CEP:',                 PL + 345, ry, 23); val(f.prestadorCEP,     PL + 370, ry,  75)
  lbl('Telefone:',            PL + 452, ry, 40); val(f.prestadorTel,     PL + 495, ry,  80)
  ry += 11

  lbl('Bairro:',              PL + 2,   ry, 32); val(f.prestadorBairro,  PL + 36,  ry, 180)
  lbl('Município:',           PL + 222, ry, 45); val(f.prestadorMun,     PL + 269, ry, 180)
  ry += 11

  lbl('E-mail:',              PL + 2,   ry, 32); val(f.prestadorEmail,   PL + 36,  ry, 280)
  lbl('País:',                PL + 322, ry, 25); val(f.prestadorPais || 'BRASIL', PL + 349, ry, 80)
  ry += 10

  y = ry; hline(y)

  // ── DADOS DO TOMADOR ─────────────────────────────────────────
  y = secHdr('DADOS DO TOMADOR', y)
  ry = y + 2

  lbl('Nome/Razão Social:',   PL + 2,   ry, 80); val(f.tomadorNome,      PL + 84,  ry, W - 90)
  ry += 11

  lbl('CNPJ/CPF:',            PL + 2,   ry, 40); val(f.tomadorCnpj,      PL + 44,  ry, 235)
  lbl('E-mail:',              PL + 285, ry, 32); val(f.tomadorEmail,     PL + 319, ry,  W - 319 + PL)
  ry += 11

  lbl('Endereço:',            PL + 2,   ry, 42); val(f.tomadorEnd,       PL + 46,  ry, W - 50)
  ry += 11

  lbl('País:',                PL + 2,   ry, 25); val(f.tomadorPais || 'BRASIL', PL + 29, ry, 80)
  lbl('Nif:',                 PL + 115, ry, 20); val(f.tomadorNif || '', PL + 137, ry,  80)
  ry += 10

  y = ry; hline(y)

  // ── DISCRIMINAÇÃO DO SERVIÇO ──────────────────────────────────
  y = secHdr('DISCRIMINAÇÃO DO SERVIÇO', y)

  doc.font('Helvetica').fontSize(8).fillColor(BLK)
     .text(f.descServico || '', PL + 3, y + 3, { width: W - 6, lineBreak: true, align: 'left' })
  // garante altura mínima de 60pt para a seção
  y = Math.max(doc.y + 5, y + 60)
  hline(y)

  // ── VALOR BRUTO ───────────────────────────────────────────────
  y += 3
  t('VALOR BRUTO DA NOTA', PL + 2, y, W - 120, { bold: true, size: 9, align: 'right', color: DRK })
  t(fmtVal(f.valorBruto),  PR - 115, y, 112, { bold: true, size: 9, align: 'right' })
  vline(PR - 120, y, 13)
  y += 14; hline(y)

  // Linha: deduções + ISS (6 colunas)
  const DC = [
    { lbl: 'Valor Total das Deduções:',  val: fmtVal(f.valorDeducoes),  w: 90 },
    { lbl: 'Desconto Incondicionado:',   val: fmtVal(f.descontoIncond), w: 89 },
    { lbl: 'Desconto Condicionado:',     val: fmtVal(f.descontoCond),   w: 89 },
    { lbl: 'Base de Cálculo:',           val: fmtVal(f.baseCalculo),    w: 89 },
    { lbl: 'Alíquota:',                  val: fmtAliq(f.aliquota),      w: 83 },
    { lbl: 'Valor do ISS:',              val: fmtVal(f.valorIss),       w: 99 },
  ]
  y += 1
  let cx = PL
  for (let i = 0; i < DC.length; i++) {
    const c = DC[i]
    if (i > 0) vline(cx, y, 24)
    t(c.lbl, cx + 2, y + 1,  c.w - 4, { bold: true, size: 6.5, color: DRK })
    t(c.val, cx + 2, y + 11, c.w - 4, { bold: false, size: 7 })
    cx += c.w
  }
  y += 25; hline(y)

  // Linha: PIS/COFINS/INSS/IR/CSLL/Outras (6 colunas)
  const PR6 = [
    { lbl: 'PIS:',              val: fmtVal(f.pis),             w: 90 },
    { lbl: 'COFINS:',           val: fmtVal(f.cofins),          w: 89 },
    { lbl: 'INSS:',             val: fmtVal(f.inss),            w: 89 },
    { lbl: 'IR:',               val: fmtVal(f.ir),              w: 89 },
    { lbl: 'CSLL:',             val: fmtVal(f.csll),            w: 83 },
    { lbl: 'Outras Retenções:', val: fmtVal(f.outrasRetencoes), w: 99 },
  ]
  y += 1; cx = PL
  for (let i = 0; i < PR6.length; i++) {
    const c = PR6[i]
    if (i > 0) vline(cx, y, 24)
    t(c.lbl, cx + 2, y + 1,  c.w - 4, { bold: true, size: 6.5, color: DRK })
    t(c.val, cx + 2, y + 11, c.w - 4, { bold: false, size: 7 })
    cx += c.w
  }
  y += 25; hline(y)

  // Tributos + VALOR LÍQUIDO
  y += 3
  t(`Valor Aproximado dos tributos ${fmtVal(f.valorTributos || 0)}`, PL + 3, y, 250, { size: 7 })
  t('VALOR LÍQUIDO DA NOTA', PL + 255, y, W - 375, { bold: true, size: 9, align: 'right', color: DRK })
  t(fmtVal(f.valorLiquido),  PR - 115,  y, 112,    { bold: true, size: 9, align: 'right' })
  vline(PR - 120, y, 13)
  y += 14; hline(y)

  // ── IBS/CBS/NBS ───────────────────────────────────────────────
  y = secHdr('IBS/CBS/NBS', y)
  ry = y + 2

  lbl('Código NBS:',            PL + 2,   ry, 52); val(f.codigoNbs || '', PL + 56, ry, 150)
  ry += 11
  lbl('Indicador de Operação:', PL + 2,   ry, 92); val(f.indicadorOp || '', PL + 96, ry, 180)
  ry += 11
  lbl('Código CST:',            PL + 2,   ry, 52); val(f.codigoCST || '', PL + 56, ry, 140)
  lbl('Código Class. Trib.:',   PL + 255, ry, 85); val(f.codigoClassTrib || '', PL + 342, ry, 100)
  ry += 13

  const IC = [
    { lbl: 'Base Cálculo IBS/CBS', val: fmtVal(f.ibsBase || 0),     w: 108 },
    { lbl: 'CBS',                  val: fmtVal(f.cbs || 0),          w: 107 },
    { lbl: 'IBS Estadual',         val: fmtVal(f.ibsEstadual || 0),  w: 108 },
    { lbl: 'IBS Municipal',        val: fmtVal(f.ibsMunicipal || 0), w: 108 },
    { lbl: 'Total IBS/CBS',        val: fmtVal(f.totalIbsCbs || 0),  w: 108 },
  ]
  cx = PL
  for (let i = 0; i < IC.length; i++) {
    const c = IC[i]
    if (i > 0) vline(cx, ry, 24)
    t(c.lbl, cx + 2, ry + 1,  c.w - 4, { bold: true, size: 6.5, color: DRK })
    t(c.val, cx + 2, ry + 11, c.w - 4, { bold: false, size: 7 })
    cx += c.w
  }
  y = ry + 25; hline(y)

  // ── ENQUADRAMENTO DO SERVIÇO ──────────────────────────────────
  y = secHdr('ENQUADRAMENTO DO SERVIÇO', y)
  doc.font('Helvetica').fontSize(8).fillColor(BLK)
     .text(f.atividade || '', PL + 3, y + 3, { width: W - 6, lineBreak: true })
  y = doc.y + 5; hline(y)

  // ── OUTRAS INFORMAÇÕES ────────────────────────────────────────
  y = secHdr('OUTRAS INFORMAÇÕES', y)
  ry = y + 2

  lbl('Mês de Competência:',     PL + 2,   ry, 88)
  t(fmtComp(f.competencia), PL + 92, ry, 50, { bold: true, size: 7 })
  lbl('Local do Recolhimento:',  PL + 148, ry, 96)
  t(f.localRecolhimento || '',   PL + 246, ry, 80, { bold: true, size: 7 })
  lbl('Data Geração:',           PL + 340, ry, 60)
  val(f.dataGeracao || fmtDateTime(f.dhEmi), PL + 402, ry, 165)
  ry += 11

  lbl('Recolhimento:',           PL + 2,   ry, 60)
  t(f.recolhimento || 'Sem Retenção', PL + 64, ry, 120, { bold: true, size: 7 })
  ry += 11

  lbl('CNAE:',                   PL + 2,   ry, 30); val(f.cnae || '', PL + 34, ry, 80)
  if (f.simples) val('Empresa Optante do Simples Nacional', PL + 180, ry, 200)
  ry += 11

  if (f.meEpp) {
    val('Microempresário e Empresa de Pequeno Porte (ME EPP)', PL + 2, ry, 300)
    ry += 11
  }

  lbl('Observações:', PL + 2, ry, 58)
  if (f.observacoes) val(f.observacoes, PL + 62, ry, W - 66)
  ry += 18

  y = ry; hline(y)

  // ── RODAPÉ ────────────────────────────────────────────────────
  y += 3
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(DRK)
     .text(`Chave de acesso : ${f.chave || ''}`, PL + 2, y, { width: 360, lineBreak: false, continued: false })
  doc.font('Helvetica-Bold').fontSize(6.5)
     .text('Link consulta pública : https://www.nfse.gov.br/consultapublica', PL + 365, y, { width: W - 367, align: 'right', lineBreak: false, continued: false })
  y += 10
  const nowStr = fmtDateTime(new Date().toISOString())
  doc.font('Helvetica').fontSize(6.5).fillColor(DRK)
     .text(`Impresso em: ${f.impresso || nowStr}`, PL + 2, y, { width: 260, lineBreak: false, continued: false })
  doc.font('Helvetica').fontSize(6.5)
     .text('O conteúdo deste documento fiscal é de inteira responsabilidade do emissor.', PL + 265, y, { width: W - 267, align: 'right', lineBreak: false, continued: false })
  y += 12; hline(y)

  // ── CANHOTO (linha pontilhada) ────────────────────────────────
  y += 3
  doc.moveTo(PL, y).lineTo(PR, y).dash(4, { space: 3 }).lineWidth(0.5).strokeColor(BLK).stroke()
  doc.undash()
  y += 5

  const TEAR_H   = 52
  const TEAR_DIV = W * 0.65
  vline(PL + TEAR_DIV, y, TEAR_H)

  // Lado esquerdo do canhoto
  t(`Recebi(emos) de: ${f.prestadorNome || ''}`, PL + 2, y + 2, TEAR_DIV - 6, { bold: true, size: 7, color: DRK })
  t('Os serviços constantes nesta Nota Fiscal de Serviços Eletrônica.', PL + 2, y + 13, TEAR_DIV - 6, { size: 6.5 })

  // Linhas de assinatura
  const sigY = y + 37
  doc.moveTo(PL + 2, sigY).lineTo(PL + 75, sigY).lineWidth(0.4).strokeColor(DRK).stroke()
  t('Data', PL + 22, sigY + 2, 50, { size: 6.5 })
  doc.moveTo(PL + 95, sigY).lineTo(PL + TEAR_DIV - 8, sigY).lineWidth(0.4).strokeColor(DRK).stroke()
  t('Assinatura do Recebedor', PL + 175, sigY + 2, 140, { size: 6.5 })

  // Lado direito do canhoto
  const RTA = PL + TEAR_DIV + 6
  const RTW = W - TEAR_DIV - 8
  t('NOTA FISCAL DE SERVIÇOS ELETRÔNICA', RTA, y + 3,  RTW, { bold: true,  size: 7, align: 'center' })
  t(`Número: ${f.numero || ''}`,          RTA, y + 14, RTW, { bold: false, size: 7, align: 'center' })
  t('Certificação',                        RTA, y + 26, RTW, { bold: true,  size: 7, align: 'center' })
  t(f.certificacao || '',                  RTA, y + 36, RTW, { bold: true,  size: 8, align: 'center' })

  hline(y + TEAR_H)
}

// ── extrairCamposPdf ──────────────────────────────────────────────
function extrairCamposPdf(xml, cobData, profile) {
  // Extrai primeira ocorrência de uma tag XML
  const tag = (t, fb = '') => {
    const m = String(xml || '').match(new RegExp(`<${t}[^>]*>([^<]+)<\\/${t}>`))
    return m ? m[1].trim() : fb
  }
  const tagFloat = (t, fb = 0) => parseFloat(tag(t) || fb) || 0

  // ── UF derivada do código IBGE ────────────────────────────────
  const ibge  = String(profile?.nfse_municipio_ibge || '')
  const uf    = IBGE_UF[ibge.slice(0, 2)] || ''
  const munNome = (profile?.nfse_municipio_nome || '').toUpperCase()

  // ── Regime tributário ─────────────────────────────────────────
  const regime    = profile?.regime_tributario || 'simples'
  const isSimples = regime === 'simples' || regime === 'mei'

  // ── Chave / número / data ─────────────────────────────────────
  const chave = tag('chNFSe') || tag('chaveAcesso') || ''
  const dhEmi = tag('dhEmi') || tag('dhEmiNFSe') || new Date().toISOString()

  // ── Valores fiscais — prioridade: XML > calculado pelo perfil ─
  const aliquotaProfile = parseFloat(String(profile?.aliquota_iss || '0').replace(',', '.')) || 0
  const valorBruto      = tagFloat('vServ') || parseFloat(cobData?.totalValue || '0') || 0
  const baseCalculo     = tagFloat('vBC') || valorBruto
  const aliquota        = tagFloat('pAliq') || aliquotaProfile
  const valorIss        = tagFloat('vISSQN') || tagFloat('vISS') || +(baseCalculo * aliquota / 100).toFixed(2)

  // Impostos federais (do XML; zero se não retornado — comum no Simples)
  // Aceita tanto as tags do XML de retorno do SEFIN (vPIS, vCOFINS, vIRRF, vCSLL)
  // quanto as tags da DPS que enviamos (vPis, vCofins, vRetIRRF, vRetCSLL)
  const pis   = tagFloat('vPIS')   || tagFloat('vPis')   || tagFloat('vRetPIS')
  const cofins = tagFloat('vCOFINS') || tagFloat('vCofins') || tagFloat('vRetCOFINS')
  const inss   = tagFloat('vINSS')  || tagFloat('vInss')  || tagFloat('vRetCP')
  const ir     = tagFloat('vIR')    || tagFloat('vIRRF')  || tagFloat('vRetIRRF')
  const csll   = tagFloat('vCSLL')  || tagFloat('vRetCSLL')
  const outrasRetencoes = 0

  // Tributos aproximados (pTotTribSN = % para Simples; senão soma)
  const pTotSN        = tagFloat('pTotTribSN')
  const valorTributos = pTotSN > 0 ? +(valorBruto * pTotSN / 100).toFixed(2) : (pis + cofins + inss + ir + csll)
  const valorLiquido  = tagFloat('vLiq') || +(valorBruto - valorIss - ir - inss).toFixed(2)

  // IBS/CBS (reforma tributária — zeros quando não vigente)
  const cbs          = tagFloat('vCBS')
  const ibsEstadual  = tagFloat('vIBSUF') || tagFloat('vIBSEst')
  const ibsMunicipal = tagFloat('vIBSMun')
  const ibsBase      = tagFloat('vBCIBS') || tagFloat('vBCCBS')
  const totalIbsCbs  = tagFloat('vTotIBSCBS') || +(cbs + ibsEstadual + ibsMunicipal).toFixed(2)
  const codigoNbs    = tag('cNBS')

  // ── LC 116: código e descrição ───────────────────────────────
  const codLc116   = cobData?.codServicoLc116 || profile?.nfse_codigo_servico || ''
  const lc116Desc  = LC116_MAP[codLc116] || ''

  // Discriminação — prioridade:
  // 1. cobData.discriminacao (texto livre do contrato ou capturado no mês — salvo na emissão)
  // 2. Descrição do código LC 116 cadastrado no contrato
  // 3. xInfComp do XML (gerado automaticamente pelo sistema)
  const descServico = cobData?.discriminacao
    || (lc116Desc ? `${codLc116} - ${lc116Desc}` : '')
    || tag('xInfComp')
    || tag('xDiscServ')
    || ''

  // ── Enquadramento ─────────────────────────────────────────────
  const atividade  = lc116Desc ? `Atividade: ${codLc116} - ${lc116Desc}` : ''

  // ── Tipo de retenção ISS ──────────────────────────────────────
  const tpRet     = tag('tpRetISSQN')
  const recolhimento = tpRet === '2' ? 'Com Retenção (Tomador)' : 'Sem Retenção'

  return {
    // Identificação
    numero:        tag('nNFSe') || tag('nNfse') || '',
    serie:         profile?.nfse_serie || 'E',
    chave,
    dhEmi,
    dataGeracao:   fmtDateTime(dhEmi),
    certificacao:  chave.slice(0, 9).toUpperCase(),
    municipioNome: munNome ? `MUNICÍPIO DE ${munNome}` : '',

    // Prestador (sempre do profile — mais confiável que o XML)
    prestadorNome:     profile?.company_name       || '',
    prestadorFantasia: profile?.nome_fantasia       || profile?.company_name || '',
    prestadorCnpj:     profile?.cnpj               || '',
    prestadorInscMun:  profile?.inscricao_municipal || '',
    prestadorEnd:      profile?.nfse_logradouro     || '',
    prestadorNumero:   profile?.nfse_numero_end     || '',
    prestadorCompl:    profile?.nfse_complemento    || '',
    prestadorBairro:   profile?.nfse_bairro         || '',
    prestadorMun:      munNome,
    prestadorUF:       uf,
    prestadorCEP:      profile?.nfse_cep            || '',
    prestadorEmail:    profile?.from_email || profile?.smtp_user || '',
    prestadorTel:      profile?.telefone            || '',
    prestadorPais:     'BRASIL',

    // Tomador — endereço: usa tomadorEnd (notas avulsas) ou property (contratos)
    // Inscrição municipal do tomador removida (sem fonte de dados disponível)
    tomadorNome:   cobData?.tenant   || '',
    tomadorCnpj:   cobData?.cpf      || '',
    tomadorEnd: (() => {
      const te = cobData?.tomadorEnd
      if (te && (te.logradouro || te.cep)) {
        const parts = []
        if (te.logradouro) parts.push(te.numero ? `${te.logradouro}, ${te.numero}` : te.logradouro)
        if (te.bairro)     parts.push(te.bairro)
        if (te.cep)        parts.push(String(te.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2'))
        if (parts.length)  return parts.join(' — ')
      }
      return cobData?.property || ''
    })(),   // endereço do tomador (avulsa) ou imóvel (contrato)
    tomadorNumero: '',
    tomadorCompl:  '',
    tomadorBairro: '',
    tomadorMun:    '',
    tomadorUF:     '',
    tomadorCEP:    '',
    tomadorEmail:  cobData?.email    || '',
    tomadorTel:    '',
    tomadorPais:   'BRASIL',
    tomadorNif:    '',

    // Serviço e valores (do XML, com fallback calculado)
    descServico,
    valorBruto,
    valorDeducoes:   tagFloat('vDesc'),
    descontoIncond:  tagFloat('vDescIncond'),
    descontoCond:    tagFloat('vDescCond'),
    baseCalculo,
    aliquota,
    valorIss,
    pis,
    cofins,
    inss,
    ir,
    csll,
    outrasRetencoes,
    valorTributos,
    valorLiquido,

    // IBS/CBS/NBS (reforma tributária — zeros quando não vigente)
    codigoNbs,
    indicadorOp:      tag('indOp'),
    codigoCST:        tag('cCST'),
    codigoClassTrib:  tag('cClassTrib'),
    ibsBase,
    cbs,
    ibsEstadual,
    ibsMunicipal,
    totalIbsCbs,

    // Enquadramento (baseado no código LC 116 do contrato ou perfil)
    atividade,

    // Outras informações
    competencia:       cobData?.mesRef || '',
    localRecolhimento: munNome && uf ? `${munNome}/${uf}` : munNome || '',
    recolhimento,
    cnae:              profile?.nfse_codigo_servico || '',
    simples:           isSimples,
    meEpp:             isSimples,  // assume ME/EPP quando Simples Nacional (sem campo separado)
    observacoes:       '',
    impresso:          '',
  }
}

// ── Formatadores ──────────────────────────────────────────────────
function fmtVal(v) {
  const n = parseFloat(v) || 0
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function fmtAliq(v) {
  const n = parseFloat(v) || 0
  return n.toFixed(4).replace('.', ',') + '%'
}

function fmtDate(s) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d)) return String(s).slice(0, 10)
  return d.toLocaleDateString('pt-BR')
}

function fmtDateTime(s) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d)) return String(s)
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function fmtComp(c) {
  if (!c) return ''
  const [y, m] = String(c).split('-')
  return m ? `${m}/${y}` : c
}
