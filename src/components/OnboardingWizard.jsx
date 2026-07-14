// OnboardingWizard.jsx — wizard de primeiro acesso + banner de alerta
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── ISS por município (IBGE) — valor sugerido, confirmar na prefeitura ────────
const ISS_IBGE = {
  '4202008': '2,00', // Blumenau SC
  '4205407': '2,00', // Florianópolis SC
  '4209102': '2,00', // Joinville SC
  '4213906': '2,00', // São José SC
  '4216602': '2,00', // Tubarão SC
  '4204202': '5,00', // Criciúma SC
  '4219002': '2,00', // Chapecó SC
  '4314902': '3,00', // Porto Alegre RS
  '4310801': '5,00', // Gramado RS
  '4304606': '2,00', // Caxias do Sul RS
  '4118204': '2,00', // Ponta Grossa PR
  '4106902': '2,50', // Curitiba PR
  '4113700': '5,00', // Londrina PR
  '4115200': '5,00', // Maringá PR
  '4104808': '2,00', // Cascavel PR
}

// ── Municípios do Sul ─────────────────────────────────────────────────────────
const MUNICIPIOS = [
  { ibge:'4202008', nome:'Blumenau — SC' },
  { ibge:'4205407', nome:'Florianópolis — SC' },
  { ibge:'4209102', nome:'Joinville — SC' },
  { ibge:'4213906', nome:'São José — SC' },
  { ibge:'4216602', nome:'Tubarão — SC' },
  { ibge:'4204202', nome:'Criciúma — SC' },
  { ibge:'4219002', nome:'Chapecó — SC' },
  { ibge:'4314902', nome:'Porto Alegre — RS' },
  { ibge:'4310801', nome:'Gramado — RS' },
  { ibge:'4304606', nome:'Caxias do Sul — RS' },
  { ibge:'4118204', nome:'Ponta Grossa — PR' },
  { ibge:'4106902', nome:'Curitiba — PR' },
  { ibge:'4113700', nome:'Londrina — PR' },
  { ibge:'4115200', nome:'Maringá — PR' },
  { ibge:'4104808', nome:'Cascavel — PR' },
]

// ── Códigos LC 116/2003 — lista completa ──────────────────────────────────────
const LC116 = [
  { cod:'1.01',  desc:'Análise e desenvolvimento de sistemas' },
  { cod:'1.02',  desc:'Programação' },
  { cod:'1.03',  desc:'Processamento, armazenamento ou hospedagem de dados, textos, imagens, vídeos, páginas eletrônicas, aplicativos e sistemas de informação' },
  { cod:'1.04',  desc:'Elaboração de programas de computadores, inclusive de jogos eletrônicos' },
  { cod:'1.05',  desc:'Licenciamento ou cessão de direito de uso de programas de computação' },
  { cod:'1.06',  desc:'Assessoria e consultoria em informática' },
  { cod:'1.07',  desc:'Suporte técnico em informática, inclusive instalação, configuração e manutenção de programas e bancos de dados' },
  { cod:'1.08',  desc:'Planejamento, confecção, manutenção e atualização de páginas eletrônicas' },
  { cod:'1.09',  desc:'Disponibilização, sem cessão definitiva, de conteúdos de áudio, vídeo, imagem e texto por meio da internet (streaming)' },
  { cod:'2.01',  desc:'Serviços de pesquisas e desenvolvimento de qualquer natureza' },
  { cod:'3.02',  desc:'Exploração de salões de festas, centro de convenções, escritórios virtuais, stands, quadras esportivas, estádios, ginásios, auditórios, casas de shows, parques de diversões e congêneres' },
  { cod:'3.03',  desc:'Locação, sublocação, arrendamento, direito de passagem ou permissão de uso de ferrovia, rodovia, postes, cabos, dutos e condutos de qualquer natureza' },
  { cod:'3.04',  desc:'Locação, sublocação, arrendamento, direito de passagem de aquoduto, ponte, túnel, porto e congêneres' },
  { cod:'3.05',  desc:'Cessão de andaimes, palcos, coberturas e outras estruturas de uso temporário' },
  { cod:'4.01',  desc:'Medicina e biomedicina' },
  { cod:'4.02',  desc:'Análises clínicas, patologia, eletricidade médica, radioterapia, quimioterapia, ultrassonografia, ressonância magnética, radiologia, tomografia e congêneres' },
  { cod:'4.03',  desc:'Hospitais, clínicas, laboratórios, sanatórios, manicômios, casas de saúde, prontos-socorros, ambulatórios e congêneres' },
  { cod:'4.04',  desc:'Instrumentação cirúrgica' },
  { cod:'4.05',  desc:'Acupuntura' },
  { cod:'4.06',  desc:'Enfermagem, inclusive serviços auxiliares' },
  { cod:'4.07',  desc:'Serviços farmacêuticos' },
  { cod:'4.08',  desc:'Terapia ocupacional, fisioterapia e fonoaudiologia' },
  { cod:'4.09',  desc:'Terapias de qualquer espécie destinadas ao tratamento físico, orgânico e mental' },
  { cod:'4.10',  desc:'Nutrição' },
  { cod:'4.11',  desc:'Obstetrícia' },
  { cod:'4.12',  desc:'Odontologia' },
  { cod:'4.13',  desc:'Ortóptica' },
  { cod:'4.14',  desc:'Próteses sob encomenda' },
  { cod:'4.15',  desc:'Psicanálise' },
  { cod:'4.16',  desc:'Psicologia' },
  { cod:'4.17',  desc:'Casas de repouso e de recuperação, creches, asilos e congêneres' },
  { cod:'4.18',  desc:'Inseminação artificial, fertilização in vitro e congêneres' },
  { cod:'4.19',  desc:'Bancos de sangue, leite, pele, olhos, óvulos, sêmen e congêneres' },
  { cod:'4.20',  desc:'Coleta de sangue, leite, tecidos, sêmen, órgãos e materiais biológicos de qualquer espécie' },
  { cod:'4.21',  desc:'Unidade de atendimento, assistência ou tratamento móvel e congêneres' },
  { cod:'4.22',  desc:'Planos de medicina de grupo ou individual e convênios para prestação de assistência médica, hospitalar, odontológica e congêneres' },
  { cod:'4.23',  desc:'Outros planos de saúde que se cumpram mediante serviços de terceiros contratados, credenciados, cooperados ou pagos pelo operador' },
  { cod:'5.01',  desc:'Medicina veterinária e zootecnia' },
  { cod:'5.02',  desc:'Hospitais, clínicas, ambulatórios, prontos-socorros e congêneres, na área veterinária' },
  { cod:'5.03',  desc:'Laboratórios de análise na área veterinária' },
  { cod:'5.04',  desc:'Inseminação artificial, fertilização in vitro e congêneres na área veterinária' },
  { cod:'5.05',  desc:'Bancos de sangue e de órgãos e congêneres na área veterinária' },
  { cod:'5.06',  desc:'Coleta de sangue, leite, tecidos, sêmen, órgãos e materiais biológicos na área veterinária' },
  { cod:'5.07',  desc:'Unidade de atendimento, assistência ou tratamento móvel e congêneres na área veterinária' },
  { cod:'5.08',  desc:'Guarda, tratamento, amestramento, embelezamento, alojamento e congêneres' },
  { cod:'5.09',  desc:'Planos de atendimento e assistência médico-veterinária' },
  { cod:'6.01',  desc:'Barbearia, cabeleireiros, manicuros, pedicuros e congêneres' },
  { cod:'6.02',  desc:'Esteticistas, tratamento de pele, depilação e congêneres' },
  { cod:'6.03',  desc:'Banhos, duchas, sauna, massagens e congêneres' },
  { cod:'6.04',  desc:'Ginástica, dança, esportes, natação, artes marciais e demais atividades físicas' },
  { cod:'6.05',  desc:'Centros de emagrecimento, spa e congêneres' },
  { cod:'7.01',  desc:'Ensino regular pré-escolar, fundamental, médio e superior' },
  { cod:'7.02',  desc:'Instrução, treinamento, orientação pedagógica e educacional, avaliação de conhecimentos de qualquer natureza' },
  { cod:'7.03',  desc:'Elaboração e ministração de cursos e aulas de qualquer natureza' },
  { cod:'7.04',  desc:'Locação e operação de equipamentos para diversão, entretenimento e lazer' },
  { cod:'7.05',  desc:'Restauração, conservação e reparos de documentos, livros, revistas, jornais e outras publicações' },
  { cod:'8.01',  desc:'Hotéis, apart-hotéis, flat, hotéis residência, motéis, pensões e congêneres' },
  { cod:'8.02',  desc:'Agenciamento, organização, promoção, intermediação e execução de programas de turismo, passeios, viagens, excursões, hospedagens e congêneres' },
  { cod:'8.03',  desc:'Guias de turismo' },
  { cod:'9.01',  desc:'Agenciamento, corretagem ou intermediação de câmbio, seguros, cartões de crédito, planos de saúde e previdência privada' },
  { cod:'9.02',  desc:'Agenciamento, corretagem ou intermediação de títulos em geral, valores mobiliários e contratos quaisquer' },
  { cod:'9.03',  desc:'Agenciamento, corretagem ou intermediação de direitos de propriedade industrial, artística ou literária' },
  { cod:'9.04',  desc:'Agenciamento, corretagem ou intermediação de contratos de arrendamento mercantil (leasing), de franquia (franchising) e de faturização (factoring)' },
  { cod:'9.05',  desc:'Agenciamento, corretagem ou intermediação de bens móveis ou imóveis, não abrangidos em outros itens desta lista' },
  { cod:'9.06',  desc:'Agenciamento marítimo' },
  { cod:'9.07',  desc:'Agenciamento de notícias' },
  { cod:'9.08',  desc:'Agenciamento de publicidade e propaganda, inclusive o agenciamento de veiculação por quaisquer meios' },
  { cod:'9.09',  desc:'Representação de qualquer natureza, inclusive comercial' },
  { cod:'9.10',  desc:'Distribuição de bens de terceiros' },
  { cod:'10.01', desc:'Guarda e estacionamento de veículos terrestres automotores, de aeronaves e de embarcações' },
  { cod:'10.02', desc:'Vigilância, segurança ou monitoramento de bens e pessoas' },
  { cod:'10.03', desc:'Escolta, inclusive de veículos e cargas' },
  { cod:'10.04', desc:'Armazenamento, depósito, carga, descarga, arrumação e guarda de bens de qualquer espécie' },
  { cod:'11.01', desc:'Exploração de cassinos, trens turísticos, parques de diversões, boates, shows, cinemas, auditórios, circos, feiras livres e congêneres' },
  { cod:'11.02', desc:'Exploração de delimitação de espaço para estacionamento de veículos' },
  { cod:'11.04', desc:'Produção, mediante ou sem encomenda prévia, de eventos, espetáculos, entrevistas, shows, ballet, danças, desfiles, bailes, teatros, óperas, concertos, recitais e festivais' },
  { cod:'12.01', desc:'Shows, ballet, danças, desfiles, bailes, óperas, concertos, recitais, festivais e congêneres' },
  { cod:'12.03', desc:'Fonografia ou gravação de sons, inclusive trucagem, dublagem, mixagem e congêneres' },
  { cod:'12.04', desc:'Filmagem de festas e eventos' },
  { cod:'12.05', desc:'Fotografia e cinematografia, inclusive revelação, ampliação, cópia, reprodução, trucagem e congêneres' },
  { cod:'12.06', desc:'Reprografia, microfilmagem e digitalização' },
  { cod:'12.07', desc:'Composição gráfica, fotocomposição, clicheria, zincografia, litografia, fotolitografia' },
  { cod:'14.01', desc:'Lubrificação, limpeza, lustração, revisão, carga e recarga, conserto, restauração, blindagem, manutenção e conservação de máquinas, veículos, aparelhos e equipamentos' },
  { cod:'14.02', desc:'Assistência técnica' },
  { cod:'14.03', desc:'Recondicionamento de motores (exceto os de aeronaves)' },
  { cod:'14.04', desc:'Recauchutagem ou regeneração de pneus' },
  { cod:'14.05', desc:'Restauração, recondicionamento, acondicionamento, pintura, beneficiamento, lavagem, secagem, tingimento, galvanoplastia, anodização, corte, recorte e polimento de objetos quaisquer' },
  { cod:'14.06', desc:'Instalação e montagem de aparelhos, máquinas e equipamentos, inclusive montagem industrial' },
  { cod:'14.07', desc:'Colocação de molduras e congêneres' },
  { cod:'14.08', desc:'Encadernação, gravação e douração de livros, revistas e congêneres' },
  { cod:'14.09', desc:'Alfaiataria e costura, quando o material for fornecido pelo usuário final, exceto aviamento' },
  { cod:'14.10', desc:'Tinturaria e lavanderia' },
  { cod:'14.11', desc:'Tapeçaria e reforma de estofamentos em geral' },
  { cod:'14.12', desc:'Funilaria e lanternagem' },
  { cod:'14.13', desc:'Carpintaria e serralheria' },
  { cod:'14.14', desc:'Guincho intramunicipal, guindaste e içamento' },
  { cod:'15.01', desc:'Administração de fundos quaisquer, de consórcio, de cartão de crédito ou débito e congêneres, de carteira de clientes, de cheques pré-datados e congêneres' },
  { cod:'15.02', desc:'Abertura de contas em geral, emissão, reemissão e fornecimento de avisos, comprovantes e documentos relacionados' },
  { cod:'15.03', desc:'Locação e manutenção de cofres particulares, de terminais eletrônicos, de terminais de atendimento e de bens e equipamentos em geral' },
  { cod:'15.04', desc:'Fornecimento de produto ou a prestação de serviços de crédito de qualquer modalidade' },
  { cod:'15.05', desc:'Emissão, reemissão, liquidação, alteração, cancelamento e baixa de ordens de pagamento, ordens de crédito e similares' },
  { cod:'15.06', desc:'Análise de risco para concessão de financiamento e empréstimos, emissão de garantias, bens e direitos' },
  { cod:'15.07', desc:'Emissão, reemissão, alteração, liquidação e cancelamento de câmbio, inclusive operações de câmbio de moedas estrangeiras' },
  { cod:'15.08', desc:'Estudo, análise e avaliação de crédito de qualquer natureza' },
  { cod:'15.09', desc:'Emissão, reemissão, alteração, cessão, substituição, cancelamento e registro de contrato de seguro, inclusive vida, saúde, acidente pessoal, previdência privada e títulos de capitalização' },
  { cod:'15.10', desc:'Custódia em geral, inclusive de títulos e valores mobiliários' },
  { cod:'15.11', desc:'Corretagem, inclusive de câmbio e de seguros' },
  { cod:'15.12', desc:'Cobrança por conta de terceiros, inclusive de direitos creditórios de qualquer natureza' },
  { cod:'15.13', desc:'Agenciamento e corretagem de contratos de leasing' },
  { cod:'15.14', desc:'Serviços relacionados ao depósito, à intermediação e à aplicação de capitais, inclusive valores mobiliários e câmbio' },
  { cod:'15.16', desc:'Fornecimento, emissão, reemissão, renovação e manutenção de cartão magnético, cartão de crédito, cartão de débito, cartão salário e congêneres' },
  { cod:'15.17', desc:'Prestação de serviços de pagamento e similares previstos em legislação federal aplicável' },
  { cod:'16.01', desc:'Serviços de transporte coletivo municipal rodoviário, metroviário, ferroviário e aquaviário de passageiros' },
  { cod:'16.02', desc:'Outros serviços de transporte de natureza municipal' },
  { cod:'17.01', desc:'Assessoria ou consultoria de qualquer natureza, não contida em outros itens desta lista' },
  { cod:'17.02', desc:'Análise, exame, pesquisa, coleta, compilação e fornecimento de dados e informações de qualquer natureza, inclusive cadastro e similares' },
  { cod:'17.03', desc:'Datilografia, digitação, estenografia, expediente, secretaria em geral, resposta audível, redação, edição, interpretação, revisão, tradução, apoio e infraestrutura administrativa e congêneres' },
  { cod:'17.04', desc:'Contabilidade, inclusive serviços técnicos e auxiliares' },
  { cod:'17.05', desc:'Advocacia' },
  { cod:'17.06', desc:'Arbitragem de qualquer espécie, inclusive jurídica' },
  { cod:'17.07', desc:'Auditoria' },
  { cod:'17.08', desc:'Análise de Organização e Métodos' },
  { cod:'17.09', desc:'Atuária e cálculos técnicos de qualquer natureza' },
  { cod:'17.10', desc:'Economia' },
  { cod:'17.11', desc:'Estatística' },
  { cod:'17.12', desc:'Cobrança em geral' },
  { cod:'17.13', desc:'Assessoria, análise, avaliação, atendimento, consulta, cadastro, seleção e gerenciamento de informações relacionados a operações de arrendamento mercantil ou de financiamentos' },
  { cod:'17.15', desc:'Meteorologia' },
  { cod:'17.16', desc:'Geologia' },
  { cod:'17.17', desc:'Engenharia, arquitetura, geologia, urbanismo, construção civil, manutenção, limpeza, meio ambiente, saneamento e congêneres' },
  { cod:'17.18', desc:'Topografia' },
  { cod:'17.19', desc:'Geofísica' },
  { cod:'17.20', desc:'Projetos, cálculos e desenhos técnicos de qualquer natureza' },
  { cod:'17.21', desc:'Aerofotogrametria (inclusive interpretação), cartografia, ortofotogrametria, radares, sonares, aerofotografia e congêneres' },
  { cod:'17.22', desc:'Pesquisa, geologia e prospecção de petróleo, água subterrânea e outros recursos minerais' },
  { cod:'17.23', desc:'Perícia, laudos, exames técnicos e análises técnicas' },
  { cod:'17.24', desc:'Planejamento, organização e administração de feiras, exposições, congressos e congêneres' },
  { cod:'18.01', desc:'Serviços de regulação de sinistros vinculados a contratos de seguros; inspeção e avaliação de riscos para cobertura de contratos de seguros' },
  { cod:'19.01', desc:'Serviços de distribuição e geração de energia elétrica, gás, água e demais recursos naturais' },
  { cod:'20.01', desc:'Serviços de composição gráfica, inclusive confecção de impressos gráficos, fotocomposição, clicheria, zincografia, litografia e fotolitografia' },
  { cod:'21.01', desc:'Serviços de registros públicos, cartorários e notariais' },
  { cod:'22.01', desc:'Serviços de exploração de rodovias mediante cobrança de preço ou pedágio dos usuários' },
  { cod:'23.01', desc:'Serviços de programação e comunicação visual, desenho industrial e congêneres' },
  { cod:'24.01', desc:'Serviços de chaveiros, confecção de carimbos, placas, sinalização visual, banners, adesivos e congêneres' },
  { cod:'25.01', desc:'Funerais, inclusive fornecimento de caixão, urna ou esquifes; aluguel de capela; transporte do corpo cadavérico; fornecimento de flores, coroas e outros paramentos' },
  { cod:'25.02', desc:'Embalsamamento e outros serviços afins' },
  { cod:'25.03', desc:'Planos ou convênio funerários' },
  { cod:'25.04', desc:'Manutenção e conservação de jazigos e cemitérios' },
  { cod:'25.05', desc:'Cessão de uso de espaços em cemitérios para sepultamento' },
  { cod:'26.01', desc:'Serviços de coleta, remessa ou entrega de correspondências, documentos, objetos, bens ou valores, inclusive pelos correios; courrier e congêneres' },
  { cod:'27.01', desc:'Serviços de assistência social' },
  { cod:'28.01', desc:'Serviços de avaliação de bens e serviços de qualquer natureza' },
  { cod:'29.01', desc:'Serviços de biblioteconomia' },
  { cod:'30.01', desc:'Serviços de biologia, biotecnologia e química' },
  { cod:'31.01', desc:'Serviços técnicos em edificações, eletrônica, eletrotécnica, mecânica, telecomunicações e congêneres' },
  { cod:'32.01', desc:'Serviços de desenhos técnicos' },
  { cod:'33.01', desc:'Serviços de desembaraço aduaneiro, comissários, despachantes e congêneres' },
  { cod:'34.01', desc:'Serviços de investigações particulares, detetives e congêneres' },
  { cod:'35.01', desc:'Serviços de reportagem, assessoria de imprensa, jornalismo e relações públicas' },
  { cod:'36.01', desc:'Serviços de meteorologia' },
  { cod:'37.01', desc:'Serviços de artistas, atletas, modelos e manequins' },
  { cod:'38.01', desc:'Serviços de museologia' },
  { cod:'39.01', desc:'Serviços de ourivesaria e lapidação (quando o material for fornecido pelo tomador do serviço)' },
  { cod:'40.01', desc:'Obras de arte sob encomenda' },
]

const PIX_TYPES = [
  { value: 'cpf',       label: 'CPF'       },
  { value: 'cnpj',      label: 'CNPJ'      },
  { value: 'email',     label: 'E-mail'    },
  { value: 'telefone',  label: 'Telefone'  },
  { value: 'aleatoria', label: 'Aleatória' },
]

const digits      = v => v.replace(/\D/g, '')
const maskCpfCnpj = raw => {
  const d = digits(raw).slice(0, 14)
  if (d.length <= 11) {
    if (d.length <= 3) return d
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
  }
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
}
const maskAliquota = raw => {
  const c = raw.replace(/[^\d,]/g, '').replace(/,+/g, ',')
  const [int, dec] = c.split(',')
  if (dec !== undefined) return `${(int||'').slice(0,3)},${dec.slice(0,2)}`
  return (int||'').slice(0,3)
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
export function useOnboarding() {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, wizardOpen: false, pixSet: false })

  const check = useCallback(async () => {
    if (!user) { setState({ loading: false, wizardOpen: false, pixSet: false }); return }
    const { data } = await supabase
      .from('profiles')
      .select('pix_key_recebimento, company_name, cnpj, onboarding_done')
      .eq('id', user.id)
      .maybeSingle()
    const pixSet           = !!data?.pix_key_recebimento
    const profileComplete  = !!(data?.company_name && data?.cnpj)
    const dismissed        = !!data?.onboarding_done
    // Se perfil já está preenchido, marca como concluído automaticamente
    if (profileComplete && !dismissed) {
      await supabase.from('profiles').update({ onboarding_done: true }).eq('id', user.id)
    }
    setState({ loading: false, wizardOpen: !dismissed && !profileComplete, pixSet })
  }, [user])

  useEffect(() => { check() }, [check])

  const openWizard  = () => setState(s => ({ ...s, wizardOpen: true }))
  const closeWizard = async (pixConfigured = false) => {
    if (user) await supabase.from('profiles').update({ onboarding_done: true }).eq('id', user.id)
    setState(s => ({ ...s, wizardOpen: false, pixSet: pixConfigured || s.pixSet }))
  }

  return { ...state, openWizard, closeWizard }
}

// ─────────────────────────────────────────────────────────────────────────────
// Banner compacto
// ─────────────────────────────────────────────────────────────────────────────
export function OnboardingBanner({ onOpen }) {
  return (
    <div className="bg-amber-50 border border-amber-300 border-l-4 border-l-amber-500 rounded-2xl px-5 py-4 flex items-center gap-4 mb-5">
      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl shrink-0">⚠️</div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-amber-900 text-sm">Configure sua conta para emitir NFS-e</p>
        <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
          Para emitir notas fiscais e gerar cobranças automaticamente, complete o cadastro básico em menos de 3 minutos.
        </p>
      </div>
      <button onClick={onOpen}
        className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap shadow-sm">
        Configurar agora →
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Passo 0 — Boas-vindas
// ─────────────────────────────────────────────────────────────────────────────
function StepWelcome() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Bem-vindo ao NotaFacil! 🎉</h2>
        <p className="text-slate-500 mt-2 leading-relaxed">
          Vamos configurar o essencial para que você possa <strong className="text-slate-700">emitir NFS-e e enviar cobranças automaticamente</strong> para seus clientes. Leva menos de 3 minutos.
        </p>
      </div>
      <div className="bg-slate-50 rounded-2xl p-4 space-y-4">
        {[
          { icon:'🧾', title:'NFS-e emitida automaticamente', desc:'A nota fiscal é gerada e enviada ao cliente no momento do pagamento, sem nenhuma ação manual. Direto no portal da prefeitura.' },
          { icon:'💸', title:'Cobrança via PIX com baixa automática', desc:'O QR Code é gerado e enviado por e-mail. Quando o cliente paga, a baixa é registrada automaticamente.' },
          { icon:'📊', title:'Gestão centralizada', desc:'Contratos, clientes, cobranças e notas em um único painel. Fim das planilhas e dos processos manuais.' },
        ].map(({ icon, title, desc }) => (
          <div key={title} className="flex items-start gap-3">
            <div className="w-9 h-9 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-lg shrink-0 shadow-sm">{icon}</div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">{title}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Passo 1 — Dados da empresa
// ─────────────────────────────────────────────────────────────────────────────
function StepEmpresa({ company, setCompany, cnpj, setCnpj, inscMun, setInscMun, telefone, setTelefone, email, setEmail }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Dados da sua empresa 🏢</h2>
        <p className="text-slate-500 mt-2 leading-relaxed">
          Identificamos seu prestador de serviços para emitir as NFS-e corretamente. Esses dados aparecem nas notas fiscais enviadas aos seus clientes.
        </p>
      </div>
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5">🧾</span>
        <p className="text-sm text-indigo-800">
          <strong>Por que precisamos?</strong> A prefeitura exige CNPJ, razão social e inscrição municipal para aceitar a emissão de NFS-e via API.
        </p>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Nome / Razão social *</label>
          <input type="text" value={company} onChange={e => setCompany(e.target.value)}
            placeholder="Sua Empresa Ltda"
            className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white"/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">CNPJ / CPF *</label>
            <input type="text" value={cnpj} onChange={e => setCnpj(maskCpfCnpj(e.target.value))}
              placeholder="00.000.000/0001-00"
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white"/>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Inscrição municipal *</label>
            <input type="text" value={inscMun} onChange={e => setInscMun(e.target.value)}
              placeholder="0000000-0"
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white"/>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Telefone</label>
            <input type="tel" value={telefone} onChange={e => setTelefone(e.target.value)}
              placeholder="(47) 99999-0000"
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white"/>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">E-mail de contato</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="contato@empresa.com.br"
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white"/>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Passo 2 — Configuração Fiscal / NFS-e
// ─────────────────────────────────────────────────────────────────────────────
function StepFiscal({ ibge, setIbge, ibgeNome, setIbgeNome, codServico, setCodServico, aliquota, setAliquota, issAutoFilled, setIssAutoFilled }) {
  const [ibgeSearch,  setIbgeSearch]  = useState('')
  const [servSearch,  setServSearch]  = useState('')
  const [servOpen,    setServOpen]    = useState(false)

  const filteredMun = MUNICIPIOS.filter(m =>
    m.nome.toLowerCase().includes(ibgeSearch.toLowerCase())
  )
  const filteredServ = LC116.filter(s =>
    s.cod.includes(servSearch) ||
    s.desc.toLowerCase().includes(servSearch.toLowerCase())
  )

  const selectMunicipio = m => {
    setIbge(m.ibge)
    setIbgeNome(m.nome.split(' —')[0])
    setIbgeSearch('')
    const iss = ISS_IBGE[m.ibge]
    if (iss) { setAliquota(iss); setIssAutoFilled(true) }
  }

  const selectServico = s => {
    setCodServico(s.cod)
    setServSearch(s.cod + ' — ' + s.desc)
    setServOpen(false)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Configuração Fiscal — NFS-e 📄</h2>
        <p className="text-slate-500 mt-2 leading-relaxed">
          Esses dados são exigidos pela prefeitura para emitir notas fiscais via API. São específicos do seu município e tipo de serviço.
        </p>
      </div>
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5">✅</span>
        <p className="text-sm text-emerald-800">
          <strong>Benefício:</strong> Com esses dados configurados, sua NFS-e é emitida e enviada ao cliente <strong>automaticamente</strong> assim que o pagamento é confirmado.
        </p>
      </div>
      <div className="space-y-3">

        {/* Município */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Município *</label>
          {ibge ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-2.5 border-2 border-emerald-400 bg-emerald-50 rounded-xl text-sm text-emerald-800 font-medium">
                {ibgeNome} <span className="text-xs text-emerald-600 font-normal">(IBGE: {ibge})</span>
              </div>
              <button onClick={() => { setIbge(''); setIbgeNome(''); setIssAutoFilled(false) }}
                className="text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors text-xs">
                Trocar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text" value={ibgeSearch}
                onChange={e => setIbgeSearch(e.target.value)}
                placeholder="Digite o nome do município…"
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white"
              />
              {ibgeSearch.length > 1 && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden max-h-40 overflow-y-auto">
                  {filteredMun.length === 0 ? (
                    <p className="text-xs text-slate-400 px-4 py-3">Município não encontrado — insira o código IBGE manualmente abaixo</p>
                  ) : (
                    filteredMun.map(m => (
                      <button key={m.ibge} onClick={() => selectMunicipio(m)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 hover:text-indigo-700 border-b border-slate-50 last:border-0 transition-colors">
                        {m.nome} <span className="text-xs text-slate-400">({m.ibge})</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <input type="text" value={ibge} onChange={e => setIbge(e.target.value)}
                  placeholder="Código IBGE (ex: 4202008)"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400 bg-white"/>
                <input type="text" value={ibgeNome} onChange={e => setIbgeNome(e.target.value)}
                  placeholder="Nome do município"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400 bg-white"/>
              </div>
              <p className="text-xs text-slate-400">
                Código IBGE disponível em{' '}
                <a href="https://www.ibge.gov.br/cidades-e-estados" target="_blank" rel="noreferrer"
                  className="text-indigo-600 underline">ibge.gov.br/cidades-e-estados</a>
              </p>
            </div>
          )}
        </div>

        {/* Código de serviço LC 116 — dropdown buscável */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">
            Código do serviço — LC 116/2003
          </label>
          <div className="relative">
            <input
              type="text"
              value={servSearch}
              onChange={e => { setServSearch(e.target.value); setServOpen(true); if (!e.target.value) setCodServico('') }}
              onFocus={() => setServOpen(true)}
              placeholder="Digite para buscar por código ou descrição…"
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white pr-8"
            />
            {codServico && (
              <button onClick={() => { setCodServico(''); setServSearch(''); setServOpen(false) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-xs">✕</button>
            )}
            {servOpen && servSearch.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                {filteredServ.length === 0 ? (
                  <p className="text-xs text-slate-400 px-4 py-3">Nenhum código encontrado para "{servSearch}"</p>
                ) : (
                  filteredServ.map(s => (
                    <button key={s.cod} onClick={() => selectServico(s)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors">
                      <span className="font-mono text-indigo-700 font-bold text-xs">{s.cod}</span>
                      {' — '}
                      <span className="text-slate-700">{s.desc}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Código da atividade econômica conforme Lei Complementar 116/2003. Ex: "1.01" para desenvolvimento de sistemas.
          </p>
        </div>

        {/* Alíquota ISS */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">
            Alíquota ISS (%)
            {issAutoFilled && <span className="ml-2 text-emerald-600 font-normal normal-case">✓ preenchida automaticamente</span>}
          </label>
          <input type="text" value={aliquota}
            onChange={e => { setAliquota(maskAliquota(e.target.value)); setIssAutoFilled(false) }}
            placeholder="Ex: 2,00"
            className={`w-full px-4 py-2.5 border-2 rounded-xl text-sm focus:outline-none bg-white ${
              issAutoFilled ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 focus:border-indigo-400'
            }`}
          />
          <p className="text-xs text-slate-400 mt-1">
            {issAutoFilled
              ? 'Valor sugerido para o município selecionado — confirme com a prefeitura ou seu contador antes de usar.'
              : 'Definida pela prefeitura do seu município (entre 2% e 5%).'}
          </p>
        </div>

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Passo 3 — PIX
// ─────────────────────────────────────────────────────────────────────────────
function StepPix({ pixType, setPixType, pixKey, setPixKey }) {
  const placeholder = {
    cpf:       '000.000.000-00',
    cnpj:      '00.000.000/0001-00',
    email:     'financeiro@empresa.com.br',
    telefone:  '+55 (47) 99999-8888',
    aleatoria: 'Cole a chave aleatória gerada pelo seu banco',
  }[pixType]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Chave PIX para recebimento 💸</h2>
        <p className="text-slate-500 mt-2 leading-relaxed">
          Configure onde o valor vai cair quando o cliente efetuar o pagamento.
        </p>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5">💡</span>
        <p className="text-sm text-blue-800">
          <strong>Opcional agora.</strong> Você pode configurar depois em <strong>Configurações → Integrações</strong>. Mas com a chave PIX ativa, as cobranças são quitadas automaticamente assim que o cliente paga.
        </p>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Tipo de chave</label>
        <div className="grid grid-cols-5 gap-1.5 mb-4">
          {PIX_TYPES.map(t => (
            <button key={t.value} onClick={() => setPixType(t.value)}
              className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                pixType === t.value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Chave PIX</label>
        <input type="text" value={pixKey} onChange={e => setPixKey(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white"
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Passo 4 — Tudo pronto
// ─────────────────────────────────────────────────────────────────────────────
function StepDone({ onNavigate }) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-4">✅</div>
        <h2 className="text-2xl font-black text-slate-900">Dados básicos salvos!</h2>
        <p className="text-slate-500 mt-2 leading-relaxed">
          Agora complete os dois passos abaixo em <strong>Configurações</strong> para ativar a emissão automática de NFS-e.
        </p>
      </div>
      <div className="space-y-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Próximos passos obrigatórios para NFS-e</p>
        <button onClick={() => onNavigate('/config')}
          className="w-full flex items-center gap-4 bg-indigo-50 border-2 border-indigo-200 rounded-2xl px-4 py-4 hover:border-indigo-400 transition-all group text-left">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-xl shrink-0 group-hover:bg-indigo-200 transition-colors">🔐</div>
          <div className="flex-1">
            <p className="font-bold text-indigo-900 text-sm">Upload do certificado digital A1</p>
            <p className="text-xs text-indigo-600 mt-0.5">Necessário para assinar as NFS-e junto à prefeitura. Vá em Configurações → Fiscal / NFS-e.</p>
          </div>
          <span className="text-indigo-400 text-lg group-hover:translate-x-1 transition-transform">→</span>
        </button>
        <button onClick={() => onNavigate('/config')}
          className="w-full flex items-center gap-4 bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-4 hover:border-indigo-300 transition-all group text-left">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-xl shrink-0 group-hover:bg-slate-200 transition-colors">✉️</div>
          <div className="flex-1">
            <p className="font-bold text-slate-800 text-sm">Personalizar template do e-mail</p>
            <p className="text-xs text-slate-500 mt-0.5">Configure o e-mail enviado ao cliente com o boleto e a NFS-e. Vá em Configurações → Template.</p>
          </div>
          <span className="text-slate-400 text-lg group-hover:translate-x-1 transition-transform">→</span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 pt-1">
        {[
          { icon:'👤', title:'Adicionar clientes',  desc:'Cadastre seus clientes',           path:'/inquilinos' },
          { icon:'🏠', title:'Criar contratos',     desc:'Cadastre contratos de serviço',    path:'/contratos'  },
        ].map(({ icon, title, desc, path }) => (
          <button key={title} onClick={() => onNavigate(path)}
            className="bg-white border border-slate-100 rounded-2xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all text-left">
            <div className="text-2xl mb-2">{icon}</div>
            <p className="font-bold text-slate-800 text-sm">{title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard principal
// ─────────────────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 'welcome'                                   },
  { id: 'empresa', label: 'Empresa',  skippable: false },
  { id: 'fiscal',  label: 'Fiscal',   skippable: true  },
  { id: 'pix',     label: 'PIX',      skippable: true  },
  { id: 'done'                                      },
]
const CONTENT_STEPS = STEPS.filter(s => s.id !== 'welcome' && s.id !== 'done')

export default function OnboardingWizard({ onComplete }) {
  const { user }    = useAuth()
  const navigate    = useNavigate()
  const [step,    setStep]    = useState(0)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  // Dados empresa
  const [company,  setCompany]  = useState('')
  const [cnpj,     setCnpj]     = useState('')
  const [inscMun,  setInscMun]  = useState('')
  const [telefone, setTelefone] = useState('')
  const [emailCon, setEmailCon] = useState('')

  // Dados fiscal
  const [ibge,          setIbge]          = useState('')
  const [ibgeNome,      setIbgeNome]      = useState('')
  const [codServico,    setCodServico]    = useState('')
  const [aliquota,      setAliquota]      = useState('')
  const [issAutoFilled, setIssAutoFilled] = useState(false)

  // PIX
  const [pixType, setPixType] = useState('cpf')
  const [pixKey,  setPixKey]  = useState('')

  const current = STEPS[step]
  const isDone  = current.id === 'done'
  const stepIdx = step - 1

  const handleNext = async () => {
    setError('')

    if (current.id === 'empresa') {
      if (!company.trim()) { setError('Informe o nome da empresa para continuar.'); return }
      if (!cnpj.trim())    { setError('Informe o CNPJ/CPF para continuar.'); return }
      setSaving(true)
      const { error: e } = await supabase.from('profiles').update({
        company_name:        company.trim()  || null,
        cnpj:                cnpj.trim()     || null,
        inscricao_municipal: inscMun.trim()  || null,
        telefone:            telefone.trim() || null,
        email_contato:       emailCon.trim() || null,
      }).eq('id', user.id)
      setSaving(false)
      if (e) { setError('Erro ao salvar: ' + e.message); return }
    }

    if (current.id === 'fiscal' && (ibge || codServico || aliquota)) {
      setSaving(true)
      await supabase.from('profiles').update({
        nfse_municipio_ibge: ibge.trim()       || null,
        nfse_municipio_nome: ibgeNome.trim()   || null,
        nfse_codigo_servico: codServico.trim() || null,
        aliquota_iss: aliquota.replace(',', '.') ? parseFloat(aliquota.replace(',', '.')) || null : null,
      }).eq('id', user.id)
      setSaving(false)
    }

    if (current.id === 'pix' && pixKey.trim()) {
      setSaving(true)
      await supabase.from('profiles').update({
        pix_key_recebimento: pixKey.trim(),
        pix_key_type:        pixType,
      }).eq('id', user.id)
      setSaving(false)
    }

    if (isDone) {
      if (user) await supabase.from('profiles').update({ onboarding_done: true }).eq('id', user.id)
      onComplete?.()
      return
    }

    setStep(s => s + 1)
  }

  // Chamado pelos botões da tela done
  const handleNavigate = async (path) => {
    if (user) await supabase.from('profiles').update({ onboarding_done: true }).eq('id', user.id)
    onComplete?.()
    navigate(path)
  }

  // Fechar/dispensar wizard — grava onboarding_done no Supabase
  const handleClose = async () => {
    if (user) await supabase.from('profiles').update({ onboarding_done: true }).eq('id', user.id)
    onComplete?.()
  }

  const handleSkip = () => setStep(s => s + 1)

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-auto overflow-hidden">

        {/* Botão fechar */}
        <div className="flex justify-end pt-4 pr-4 pb-0">
          <button onClick={handleClose}
            title="Fechar"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors text-lg">
            ✕
          </button>
        </div>

        {step > 0 && !isDone && (
          <div className="h-1.5 bg-slate-100">
            <div className="h-full bg-indigo-500 rounded-r-full transition-all duration-500"
              style={{ width: `${(stepIdx / CONTENT_STEPS.length) * 100}%` }}/>
          </div>
        )}

        <div className="p-8 pt-4">
          {step > 0 && !isDone && (
            <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
              {CONTENT_STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 shrink-0">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    i < stepIdx   ? 'bg-indigo-600 text-white'
                    : i === stepIdx ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400'
                    : 'bg-slate-100 text-slate-400'
                  }`}>{i < stepIdx ? '✓' : i + 1}</div>
                  <span className={`text-xs font-medium ${i === stepIdx ? 'text-slate-700' : 'text-slate-400'}`}>{s.label}</span>
                  {i < CONTENT_STEPS.length - 1 && <div className="w-5 h-px bg-slate-200 mx-1"/>}
                </div>
              ))}
            </div>
          )}

          {current.id === 'welcome' && <StepWelcome />}
          {current.id === 'empresa' && (
            <StepEmpresa
              company={company} setCompany={setCompany}
              cnpj={cnpj} setCnpj={setCnpj}
              inscMun={inscMun} setInscMun={setInscMun}
              telefone={telefone} setTelefone={setTelefone}
              email={emailCon} setEmail={setEmailCon}
            />
          )}
          {current.id === 'fiscal' && (
            <StepFiscal
              ibge={ibge} setIbge={setIbge}
              ibgeNome={ibgeNome} setIbgeNome={setIbgeNome}
              codServico={codServico} setCodServico={setCodServico}
              aliquota={aliquota} setAliquota={setAliquota}
              issAutoFilled={issAutoFilled} setIssAutoFilled={setIssAutoFilled}
            />
          )}
          {current.id === 'pix' && (
            <StepPix
              pixType={pixType} setPixType={setPixType}
              pixKey={pixKey} setPixKey={setPixKey}
            />
          )}
          {current.id === 'done' && <StepDone onNavigate={handleNavigate} />}

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-7">
            {current.skippable && (
              <button onClick={handleSkip}
                className="py-3 px-4 rounded-xl border-2 border-slate-200 text-slate-500 font-semibold hover:bg-slate-50 text-sm transition-colors">
                Pular por agora
              </button>
            )}
            <button onClick={handleNext} disabled={saving}
              className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm transition-colors shadow-md shadow-indigo-200">
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Salvando…</>
              ) : current.id === 'welcome' ? 'Vamos começar →'
                : isDone ? 'Ir para Configurações →'
                : 'Próximo →'}
            </button>
          </div>

          {!isDone && (
            <p className="text-center text-xs text-slate-400 mt-4">
              Todas as informações podem ser alteradas em <strong className="text-slate-500">Configurações</strong>.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
