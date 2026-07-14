// OnboardingWizard.jsx — wizard de primeiro acesso + banner de alerta
// Exporta:
//   default        OnboardingWizard  — modal full-screen, 5 passos
//   useOnboarding  hook              — { loading, wizardOpen, pixSet, openWizard, closeWizard }
//   OnboardingBanner                 — banner compacto para Contratos / Cobranças

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ─── chave localStorage ───────────────────────────────────────────────────────
const obKey = uid => `nf_ob_v1_${uid}`

// ─── municípios comuns do Sul ─────────────────────────────────────────────────
const MUNICIPIOS = [
  { ibge:'4202008', nome:'Blumenau — SC' },
  { ibge:'4205407', nome:'Florianópolis — SC' },
  { ibge:'4209102', nome:'Joinville — SC' },
  { ibge:'4213906', nome:'São José — SC' },
  { ibge:'4216602', nome:'Tubarão — SC' },
  { ibge:'4204202', nome:'Criciúma — SC' },
  { ibge:'4219002', nome:'Chapecó — SC' },
  { ibge:'4307609', nome:'Porto Alegre — RS' },
  { ibge:'4314902', nome:'Porto Alegre — RS' },
  { ibge:'4310801', nome:'Gramado — RS' },
  { ibge:'4304606', nome:'Caxias do Sul — RS' },
  { ibge:'4118204', nome:'Ponta Grossa — PR' },
  { ibge:'4106902', nome:'Curitiba — PR' },
  { ibge:'4113700', nome:'Londrina — PR' },
  { ibge:'4115200', nome:'Maringá — PR' },
  { ibge:'4104808', nome:'Cascavel — PR' },
]

// ─── tipos de chave PIX ───────────────────────────────────────────────────────
const PIX_TYPES = [
  { value: 'cpf',       label: 'CPF'       },
  { value: 'cnpj',      label: 'CNPJ'      },
  { value: 'email',     label: 'E-mail'    },
  { value: 'telefone',  label: 'Telefone'  },
  { value: 'aleatoria', label: 'Aleatória' },
]

// ─── máscara CNPJ/CPF ─────────────────────────────────────────────────────────
const digits  = v => v.replace(/\D/g, '')
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
    const done = !!localStorage.getItem(obKey(user.id))
    const { data } = await supabase
      .from('profiles')
      .select('pix_key_recebimento')
      .eq('id', user.id)
      .maybeSingle()
    const pixSet = !!data?.pix_key_recebimento
    setState({ loading: false, wizardOpen: !done, pixSet })
  }, [user])

  useEffect(() => { check() }, [check])

  const openWizard  = () => setState(s => ({ ...s, wizardOpen: true }))
  const closeWizard = (pixConfigured = false) => {
    if (user) localStorage.setItem(obKey(user.id), '1')
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
      <button
        onClick={onOpen}
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
          {
            icon: '🧾',
            title: 'NFS-e emitida automaticamente',
            desc: 'A nota fiscal é gerada e enviada ao cliente no momento do pagamento, sem nenhuma ação manual. Direto no portal da prefeitura.',
          },
          {
            icon: '💸',
            title: 'Cobrança via PIX com baixa automática',
            desc: 'O QR Code é gerado e enviado por e-mail. Quando o cliente paga, a baixa é registrada automaticamente.',
          },
          {
            icon: '📊',
            title: 'Gestão centralizada',
            desc: 'Contratos, clientes, cobranças e notas em um único painel. Fim das planilhas e dos processos manuais.',
          },
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
            placeholder="Sua Imobiliária Ltda"
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
function StepFiscal({ ibge, setIbge, ibgeNome, setIbgeNome, codServico, setCodServico, aliquota, setAliquota }) {
  const [ibgeSearch, setIbgeSearch] = useState('')
  const filtered = MUNICIPIOS.filter(m =>
    m.nome.toLowerCase().includes(ibgeSearch.toLowerCase())
  )

  const selectMunicipio = m => {
    setIbge(m.ibge)
    setIbgeNome(m.nome.split(' —')[0])
    setIbgeSearch('')
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
          <strong>Benefício:</strong> Com esses dados configurados, sua NFS-e é emitida e enviada ao cliente <strong>automaticamente</strong> assim que o pagamento é confirmado — zero trabalho manual.
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
              <button onClick={() => { setIbge(''); setIbgeNome('') }}
                className="text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors text-xs">
                Trocar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={ibgeSearch}
                onChange={e => setIbgeSearch(e.target.value)}
                placeholder="Digite o nome do município…"
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white"
              />
              {ibgeSearch.length > 1 && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden max-h-40 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="text-xs text-slate-400 px-4 py-3">Município não encontrado — insira o IBGE manualmente abaixo</p>
                  ) : (
                    filtered.map(m => (
                      <button key={m.ibge} onClick={() => selectMunicipio(m)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 hover:text-indigo-700 border-b border-slate-50 last:border-0 transition-colors">
                        {m.nome} <span className="text-xs text-slate-400">({m.ibge})</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {/* Fallback manual */}
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

        {/* Código de serviço + Alíquota */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">
              Código do serviço (NBS)
            </label>
            <input type="text" value={codServico} onChange={e => setCodServico(e.target.value)}
              placeholder="Ex: 1.09.01.00.00"
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white"/>
            <p className="text-xs text-slate-400 mt-1">Código NBS do seu serviço de administração</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">
              Alíquota ISS (%)
            </label>
            <input type="text" value={aliquota} onChange={e => setAliquota(maskAliquota(e.target.value))}
              placeholder="Ex: 5,00"
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white"/>
            <p className="text-xs text-slate-400 mt-1">Definida pela prefeitura do seu município</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Passo 3 — Chave PIX (pulável)
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
          Configure onde o valor do aluguel vai cair quando o cliente efetuar o pagamento.
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
        <input
          type="text"
          value={pixKey}
          onChange={e => setPixKey(e.target.value)}
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
function StepDone() {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-4">✅</div>
        <h2 className="text-2xl font-black text-slate-900">Dados básicos salvos!</h2>
        <p className="text-slate-500 mt-2 leading-relaxed">
          Agora complete os dois passos abaixo em <strong>Configurações</strong> para ativar a emissão automática de NFS-e.
        </p>
      </div>

      {/* Próximos passos críticos */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Próximos passos obrigatórios para NFS-e</p>
        <a href="/config" className="flex items-center gap-4 bg-indigo-50 border-2 border-indigo-200 rounded-2xl px-4 py-4 hover:border-indigo-400 transition-all group">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-xl shrink-0 group-hover:bg-indigo-200 transition-colors">🔐</div>
          <div className="flex-1">
            <p className="font-bold text-indigo-900 text-sm">Upload do certificado digital A1</p>
            <p className="text-xs text-indigo-600 mt-0.5">Necessário para assinar as NFS-e junto à prefeitura. Vá em Configurações → Fiscal / NFS-e.</p>
          </div>
          <span className="text-indigo-400 text-lg group-hover:translate-x-1 transition-transform">→</span>
        </a>
        <a href="/config" className="flex items-center gap-4 bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-4 hover:border-indigo-300 transition-all group">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-xl shrink-0 group-hover:bg-slate-200 transition-colors">✉️</div>
          <div className="flex-1">
            <p className="font-bold text-slate-800 text-sm">Personalizar template do e-mail</p>
            <p className="text-xs text-slate-500 mt-0.5">Configure o e-mail que será enviado ao cliente com o boleto e a NFS-e. Vá em Configurações → Template.</p>
          </div>
          <span className="text-slate-400 text-lg group-hover:translate-x-1 transition-transform">→</span>
        </a>
      </div>

      {/* Ações secundárias */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        {[
          { icon: '👤', title: 'Adicionar clientes',   desc: 'Cadastre seus locatários',         href: '/clientes' },
          { icon: '🏠', title: 'Criar contratos',      desc: 'Cadastre contratos de aluguel',    href: '/contratos' },
        ].map(({ icon, title, desc, href }) => (
          <a key={title} href={href} className="bg-white border border-slate-100 rounded-2xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all">
            <div className="text-2xl mb-2">{icon}</div>
            <p className="font-bold text-slate-800 text-sm">{title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
          </a>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard principal
// ─────────────────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 'welcome'  },
  { id: 'empresa', label: 'Empresa',    skippable: false },
  { id: 'fiscal',  label: 'Fiscal',     skippable: true  },
  { id: 'pix',     label: 'PIX',        skippable: true  },
  { id: 'done'    },
]
const CONTENT_STEPS = STEPS.filter(s => s.id !== 'welcome' && s.id !== 'done')

export default function OnboardingWizard({ onComplete }) {
  const { user } = useAuth()
  const [step, setStep]     = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Dados empresa
  const [company,  setCompany]  = useState('')
  const [cnpj,     setCnpj]     = useState('')
  const [inscMun,  setInscMun]  = useState('')
  const [telefone, setTelefone] = useState('')
  const [emailCon, setEmailCon] = useState('')

  // Dados fiscal
  const [ibge,       setIbge]       = useState('')
  const [ibgeNome,   setIbgeNome]   = useState('')
  const [codServico, setCodServico] = useState('')
  const [aliquota,   setAliquota]   = useState('')

  // PIX
  const [pixType, setPixType] = useState('cpf')
  const [pixKey,  setPixKey]  = useState('')

  const current = STEPS[step]
  const isDone  = current.id === 'done'
  const stepIdx = step - 1 // índice 0-based nos content steps

  const handleNext = async () => {
    setError('')

    if (current.id === 'empresa') {
      if (!company.trim()) { setError('Informe o nome da empresa para continuar.'); return }
      if (!cnpj.trim())    { setError('Informe o CNPJ/CPF para continuar.'); return }
      setSaving(true)
      const { error: e } = await supabase.from('profiles').update({
        company_name:         company.trim()  || null,
        cnpj:                 cnpj.trim()     || null,
        inscricao_municipal:  inscMun.trim()  || null,
        telefone:             telefone.trim() || null,
        email_contato:        emailCon.trim() || null,
      }).eq('id', user.id)
      setSaving(false)
      if (e) { setError('Erro ao salvar: ' + e.message); return }
    }

    if (current.id === 'fiscal' && (ibge || codServico || aliquota)) {
      setSaving(true)
      await supabase.from('profiles').update({
        nfse_municipio_ibge: ibge.trim()        || null,
        nfse_municipio_nome: ibgeNome.trim()    || null,
        nfse_codigo_servico: codServico.trim()  || null,
        aliquota_iss:        aliquota.replace(',', '.') ? parseFloat(aliquota.replace(',', '.')) || null : null,
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
      if (user) localStorage.setItem(obKey(user.id), '1')
      onComplete?.()
      return
    }

    setStep(s => s + 1)
  }

  const handleSkip = () => setStep(s => s + 1)

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-auto overflow-hidden">

        {/* Barra de progresso */}
        {step > 0 && !isDone && (
          <div className="h-1.5 bg-slate-100">
            <div
              className="h-full bg-indigo-500 rounded-r-full transition-all duration-500"
              style={{ width: `${(stepIdx / CONTENT_STEPS.length) * 100}%` }}
            />
          </div>
        )}

        <div className="p-8">
          {/* Indicador de passos */}
          {step > 0 && !isDone && (
            <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
              {CONTENT_STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 shrink-0">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    i < stepIdx  ? 'bg-indigo-600 text-white'
                    : i === stepIdx ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400'
                    : 'bg-slate-100 text-slate-400'
                  }`}>{i < stepIdx ? '✓' : i + 1}</div>
                  <span className={`text-xs font-medium ${i === stepIdx ? 'text-slate-700' : 'text-slate-400'}`}>{s.label}</span>
                  {i < CONTENT_STEPS.length - 1 && <div className="w-5 h-px bg-slate-200 mx-1"/>}
                </div>
              ))}
            </div>
          )}

          {/* Conteúdo */}
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
            />
          )}
          {current.id === 'pix' && (
            <StepPix
              pixType={pixType} setPixType={setPixType}
              pixKey={pixKey} setPixKey={setPixKey}
            />
          )}
          {current.id === 'done' && <StepDone />}

          {/* Erro */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-3 mt-7">
            {current.skippable && (
              <button onClick={handleSkip}
                className="py-3 px-4 rounded-xl border-2 border-slate-200 text-slate-500 font-semibold hover:bg-slate-50 text-sm transition-colors">
                Pular por agora
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={saving}
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
