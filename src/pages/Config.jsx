import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── Máscaras de input ─────────────────────────────────────────
const digits = v => v.replace(/\D/g, '')

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

const maskPhone = raw => {
  const d = digits(raw).slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

// NBS: x.xx.xx.xx.xx (10 dígitos)
const maskNbs = raw => {
  const d = digits(raw).slice(0, 10)
  if (d.length <= 1) return d
  if (d.length <= 3) return `${d[0]}.${d.slice(1)}`
  if (d.length <= 5) return `${d[0]}.${d.slice(1,3)}.${d.slice(3)}`
  if (d.length <= 7) return `${d[0]}.${d.slice(1,3)}.${d.slice(3,5)}.${d.slice(5)}`
  return `${d[0]}.${d.slice(1,3)}.${d.slice(3,5)}.${d.slice(5,7)}.${d.slice(7)}`
}

// Alíquota: até 3 dígitos inteiros + 2 decimais com vírgula (ex: "5,00" ou "12,50")
const maskAliquota = raw => {
  const cleaned = raw.replace(/[^\d,]/g, '').replace(/,+/g, ',')
  const [int, dec] = cleaned.split(',')
  if (dec !== undefined) return `${(int || '').slice(0, 3)},${dec.slice(0, 2)}`
  return (int || '').slice(0, 3)
}

const ic = (d, cls='') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 ${cls}`}
    dangerouslySetInnerHTML={{ __html: d }} />
)
const IcRefresh = ({ c='' }) => ic('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>', c)
const IcSend    = ({ c='' }) => ic('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>', c)

const TABS = [
  { id:'empresa',  emoji:'🏢', label:'Empresa' },
  { id:'fiscal',   emoji:'📄', label:'Fiscal / NFS-e' },
  { id:'email',    emoji:'📧', label:'E-mail' },
  { id:'template', emoji:'✉️', label:'Template' },
  { id:'api',      emoji:'⚡', label:'Integrações' },
]

const VARS = [
  { v:'{{inquilino}}', label:'Inquilino' },
  { v:'{{imovel}}',    label:'Imóvel' },
  { v:'{{valor}}',     label:'Valor total' },
  { v:'{{vencimento}}',label:'Vencimento' },
  { v:'{{mes}}',       label:'Mês' },
  { v:'{{ano}}',       label:'Ano' },
  { v:'{{link_boleto}}',label:'Link boleto' },
  { v:'{{empresa}}',   label:'Empresa' },
]

const DEFAULT_BODY = `Olá, {{inquilino}}!

Segue em anexo o boleto e a nota fiscal de serviço referente à competência {{mes}}/{{ano}} do imóvel:

📍 {{imovel}}
💰 Valor total: {{valor}}
📅 Vencimento: {{vencimento}}

Para pagar via PIX, utilize o link abaixo:
{{link_boleto}}

Em caso de dúvidas, entre em contato conosco.

Atenciosamente,
{{empresa}}`

// ── Componentes de formulário — FORA do Config() para evitar o bug de foco ──
function Section({ title, children }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-4">
      <h3 className="font-semibold text-slate-800 mb-4 text-sm">{title}</h3>
      {children}
    </div>
  )
}

function Row({ label, hint, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1 leading-snug">{hint}</p>}
    </div>
  )
}

function Inp({ value, onChange, type='text', placeholder='', mono=false, disabled=false }) {
  return (
    <input
      value={value}
      onChange={onChange}
      type={type}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg ${mono ? 'font-mono' : ''} ${disabled ? 'bg-slate-50 text-slate-400' : 'focus:outline-none focus:ring-2 focus:ring-indigo-500'}`}
    />
  )
}

export default function Config() {
  const { user } = useAuth()
  const [tab, setTab]           = useState('empresa')
  const [saved, setSaved]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult]   = useState(null)   // { ok, msg }

  const [f, setF] = useState({
    // Empresa
    company:      '',
    cnpj:         '',
    inscMun:      '',
    telefone:     '',
    emailContato: '',
    endereco:     '',
    certOk:       false,
    // Fiscal
    regime:    'simples',
    nbs:       '1.05.01.09.00',
    aliquota:  '5,00',
    // E-mail
    emailProvider: 'resend',
    resendKey:     '',
    smtpHost:      '',
    smtpPort:      '587',
    smtpUser:      '',
    smtpPass:      '',
    smtpEncryption:'tls',
    fromEmail:  'cobrancas@suaempresa.com.br',
    fromName:   'Gestora Pro Imóveis',
    replyTo:    '',
    testEmailAddr: '',
    // Template
    emailSubject: 'Boleto e NFS-e de {{mes}}/{{ano}} — {{imovel}}',
    emailBody:    DEFAULT_BODY,
    // API
    openPix: '',
  })

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  // ── Carrega perfil do banco ───────────────────────────────────
  useEffect(() => {
    if (!user) return
    setLoadingProfile(true)
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        setF(p => ({
          ...p,
          company:      data?.company_name         || '',
          cnpj:         data?.cnpj                 || '',
          inscMun:      data?.inscricao_municipal   || '',
          telefone:     data?.telefone              || user.phone || '',
          emailContato: data?.email_contato         || user.email || '',
          endereco:     data?.endereco              || '',
          // Fiscal
          regime:   data?.regime_tributario  || 'simples',
          nbs:      data?.nbs_servico        || '',
          aliquota: data?.aliquota_iss       || '',
          // E-mail
          emailProvider:  data?.email_provider   || 'resend',
          resendKey:      data?.resend_api_key    || '',
          smtpHost:       data?.smtp_host         || '',
          smtpPort:       data?.smtp_port         || '587',
          smtpUser:       data?.smtp_user         || '',
          smtpPass:       data?.smtp_pass         || '',
          smtpEncryption: data?.smtp_encryption   || 'tls',
          fromEmail:      data?.from_email        || '',
          fromName:       data?.from_name         || '',
          replyTo:        data?.reply_to          || '',
          // Template
          emailSubject: data?.email_subject || 'Boleto e NFS-e de {{mes}}/{{ano}} — {{imovel}}',
          emailBody:    data?.email_body    || DEFAULT_BODY,
          // API
          openPix: data?.openpix_api_key || '',
        }))
        setLoadingProfile(false)
      })
  }, [user])

  // ── Salva no banco ────────────────────────────────────────────
  const save = async () => {
    if (!user) return
    setSaving(true)
    const payload = { id: user.id }

    if (tab === 'empresa') {
      Object.assign(payload, {
        company_name:        f.company,
        cnpj:                f.cnpj,
        inscricao_municipal: f.inscMun,
        telefone:            f.telefone,
        email_contato:       f.emailContato,
        endereco:            f.endereco,
      })
    } else if (tab === 'fiscal') {
      Object.assign(payload, {
        regime_tributario: f.regime,
        nbs_servico:       f.nbs,
        aliquota_iss:      f.aliquota,
      })
    } else if (tab === 'email') {
      Object.assign(payload, {
        email_provider:  f.emailProvider,
        // resend_api_key não é salvo — fica em variável de ambiente do servidor
        smtp_host:       f.smtpHost,
        smtp_port:       f.smtpPort,
        smtp_user:       f.smtpUser,
        smtp_pass:       f.smtpPass,
        smtp_encryption: f.smtpEncryption,
        from_email:      f.fromEmail,
        from_name:       f.fromName,
        reply_to:        f.replyTo,
      })
    } else if (tab === 'template') {
      Object.assign(payload, {
        email_subject: f.emailSubject,
        email_body:    f.emailBody,
      })
    } else if (tab === 'api') {
      Object.assign(payload, {
        openpix_api_key: f.openPix,
      })
    }

    await supabase.from('profiles').upsert(payload)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const sendTest = async () => {
    if (!f.testEmailAddr) return
    setTestSending(true)
    setTestResult(null)
    try {
      const res = await fetch('/.netlify/functions/send-test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider:       f.emailProvider,
          to:             f.testEmailAddr,
          fromName:       f.fromName,
          fromEmail:      f.fromEmail,
          replyTo:        f.replyTo,
          smtpHost:       f.smtpHost,
          smtpPort:       f.smtpPort,
          smtpUser:       f.smtpUser,
          smtpPass:       f.smtpPass,
          smtpEncryption: f.smtpEncryption,
        }),
      })

      if (res.status === 404) {
        setTestResult({ ok: false, msg: 'Função de envio não encontrada (404). Faça o deploy no Netlify e teste a partir da URL de produção.' })
        return
      }

      let data = {}
      try { data = await res.json() } catch { /* resposta sem body */ }

      if (res.ok && data.ok) {
        setTestResult({ ok: true, msg: 'E-mail enviado! Verifique sua caixa de entrada (e o spam).' })
      } else {
        setTestResult({ ok: false, msg: data.error || `Erro HTTP ${res.status}` })
      }
    } catch (err) {
      setTestResult({ ok: false, msg: err.message })
    } finally {
      setTestSending(false)
    }
  }

  useEffect(() => {
    if (!previewOpen) return
    const handle = e => { if (e.key === 'Escape') setPreviewOpen(false) }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [previewOpen])

  const renderPreview = (text) =>
    text
      .replace(/{{inquilino}}/g, 'João Carlos Santos')
      .replace(/{{imovel}}/g, 'Sala 12 — R. 7 de Setembro, 230')
      .replace(/{{valor}}/g, 'R$ 2.150,00')
      .replace(/{{vencimento}}/g, '10/07/2026')
      .replace(/{{mes}}/g, 'Julho')
      .replace(/{{ano}}/g, '2026')
      .replace(/{{link_boleto}}/g, 'https://pay.openpix.com.br/demo-link')
      .replace(/{{empresa}}/g, f.company)

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-500">Empresa, fiscal, e-mail, templates e integrações</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 min-w-fit px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* ── Empresa ────────────────────────────────────────────── */}
      {tab === 'empresa' && (
        <>
          <Section title="📋 Dados da Empresa">
            {loadingProfile ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin"/>
                Carregando dados…
              </div>
            ) : (
              <div className="space-y-3">
                <Row label="Razão Social / Nome">
                  <Inp value={f.company} onChange={e => set('company', e.target.value)} placeholder="Nome da empresa ou pessoa física"/>
                </Row>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">CNPJ / CPF</label>
                    <Inp value={f.cnpj} onChange={e => set('cnpj', maskCpfCnpj(e.target.value))} placeholder="00.000.000/0001-00"/>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Inscrição Municipal</label>
                    <Inp value={f.inscMun} onChange={e => set('inscMun', e.target.value)} placeholder="000000-0"/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Telefone</label>
                    <Inp value={f.telefone} onChange={e => set('telefone', maskPhone(e.target.value))} placeholder="(00) 00000-0000"/>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">E-mail de contato</label>
                    <Inp value={f.emailContato} onChange={e => set('emailContato', e.target.value)} type="email" placeholder="contato@empresa.com.br"/>
                  </div>
                </div>
                <Row label="Endereço">
                  <Inp value={f.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número, bairro, cidade — UF"/>
                </Row>
              </div>
            )}
          </Section>
          <Section title="🔐 Certificado Digital A1 (e-CNPJ)">
            {f.certOk ? (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-2">
                <span className="text-xl">✅</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-emerald-800">Certificado configurado</p>
                  <p className="text-xs text-emerald-600">cert-gestora-pro.pfx · válido até 15/03/2027</p>
                </div>
                <button onClick={() => set('certOk', false)} className="text-xs text-red-400 hover:text-red-600">Remover</button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center mb-2">
                <p className="text-slate-400 text-sm mb-2">Arraste o arquivo .pfx aqui ou</p>
                <button onClick={() => set('certOk', true)} className="text-indigo-600 text-sm font-medium hover:underline">clique para selecionar</button>
              </div>
            )}
            <p className="text-xs text-slate-400">Armazenado de forma criptografada (AES-256). Nunca exposto via API.</p>
          </Section>
        </>
      )}

      {/* ── Fiscal ─────────────────────────────────────────────── */}
      {tab === 'fiscal' && (
        <Section title="📄 Dados Fiscais (NFS-e)">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Regime Tributário</label>
              <select value={f.regime} onChange={e => set('regime', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="simples">Simples Nacional</option>
                <option value="presumido">Lucro Presumido</option>
                <option value="real">Lucro Real</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Código NBS do Serviço</label>
                <Inp value={f.nbs} onChange={e => set('nbs', maskNbs(e.target.value))} mono placeholder="1.05.01.09.00"/>
                <p className="text-xs text-slate-400 mt-1">1.05.01.09.00 = Administração de imóveis</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Alíquota ISS (%)</label>
                <Inp value={f.aliquota} onChange={e => set('aliquota', maskAliquota(e.target.value))} placeholder="5,00"/>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ── E-mail ─────────────────────────────────────────────── */}
      {tab === 'email' && (
        <>
          <Section title="📧 Provedor de Envio">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button onClick={() => set('emailProvider', 'resend')}
                className={`text-left p-4 rounded-xl border-2 transition-all ${f.emailProvider === 'resend' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-slate-900">Via plataforma</span>
                  <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-medium">Recomendado</span>
                </div>
                <p className="text-xs text-slate-500 leading-snug">Envio gerenciado pelo ImobiNota. Alta entregabilidade, sem configuração.</p>
              </button>
              <button onClick={() => set('emailProvider', 'smtp')}
                className={`text-left p-4 rounded-xl border-2 transition-all ${f.emailProvider === 'smtp' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-slate-900">SMTP próprio</span>
                </div>
                <p className="text-xs text-slate-500 leading-snug">Use o servidor de e-mail da sua empresa. Requer configuração técnica.</p>
              </button>
            </div>

            {f.emailProvider === 'resend' && (
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <span className="text-lg mt-0.5">✅</span>
                <div>
                  <p className="text-sm font-medium text-emerald-800">Pronto — nenhuma configuração necessária</p>
                  <p className="text-xs text-emerald-700 mt-0.5 leading-snug">
                    O envio é feito pela infraestrutura do ImobiNota com alta entregabilidade.
                    Configure abaixo apenas o nome e o e-mail de resposta.
                  </p>
                </div>
              </div>
            )}

            {f.emailProvider === 'smtp' && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-slate-500 block mb-1">Servidor SMTP</label>
                    <Inp value={f.smtpHost} onChange={e => set('smtpHost', e.target.value)} placeholder="mail.suaempresa.com.br"/>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Porta</label>
                    <select value={f.smtpPort} onChange={e => set('smtpPort', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                      <option value="587">587 (TLS)</option>
                      <option value="465">465 (SSL)</option>
                      <option value="25">25</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-slate-500 block mb-1">Usuário SMTP</label><Inp value={f.smtpUser} onChange={e => set('smtpUser', e.target.value)} placeholder="seu@email.com.br"/></div>
                  <div><label className="text-xs font-medium text-slate-500 block mb-1">Senha SMTP</label><Inp value={f.smtpPass} onChange={e => set('smtpPass', e.target.value)} type="password" placeholder="••••••••"/></div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Criptografia</label>
                  <div className="flex gap-4">
                    {['tls','ssl','none'].map(enc => (
                      <label key={enc} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="radio" name="smtpEnc" value={enc}
                          checked={f.smtpEncryption === enc} onChange={() => set('smtpEncryption', enc)}/>
                        <span className="capitalize">{enc === 'none' ? 'Nenhuma' : enc.toUpperCase()}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Section title="✉️ Identidade do Remetente">
            <div className="space-y-3">
              <div className={`grid gap-3 ${f.emailProvider === 'smtp' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Nome de exibição</label>
                  <Inp value={f.fromName} onChange={e => set('fromName', e.target.value)} placeholder="Ex: Vasselai Imóveis"/>
                  <p className="text-xs text-slate-400 mt-1">Este nome aparece no campo "De:" para o inquilino</p>
                </div>
                {f.emailProvider === 'smtp' && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">E-mail remetente (From)</label>
                    <Inp value={f.fromEmail} onChange={e => set('fromEmail', e.target.value)} type="email" placeholder="cobrancas@suaempresa.com.br"/>
                    <p className="text-xs text-slate-400 mt-1">Deve pertencer ao servidor SMTP configurado</p>
                  </div>
                )}
              </div>
              {f.emailProvider === 'resend' && (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-500">
                  <span>📨</span>
                  <span>E-mail remetente: <strong className="text-slate-700">gerenciado pela plataforma ImobiNota</strong> — as respostas dos inquilinos chegam no campo abaixo.</span>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Responder para (Reply-To)</label>
                <Inp value={f.replyTo} onChange={e => set('replyTo', e.target.value)} type="email" placeholder="contato@suaempresa.com.br"/>
                <p className="text-xs text-slate-400 mt-1">Quando o inquilino responder o e-mail, a resposta chega neste endereço</p>
              </div>
            </div>
          </Section>

          <Section title="🧪 Testar Envio">
            <p className="text-sm text-slate-500 mb-3">
              Salve as configurações acima e depois envie um e-mail de teste para verificar a entregabilidade.
            </p>
            <div className="flex gap-2">
              <input value={f.testEmailAddr} onChange={e => set('testEmailAddr', e.target.value)}
                type="email" placeholder="seu@email.com"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              <button onClick={sendTest} disabled={testSending || !f.testEmailAddr}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  testSending ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40'}`}>
                {testSending ? <><IcRefresh c="w-4 h-4 animate-spin"/> Enviando…</> : <><IcSend c="w-4 h-4"/> Enviar teste</>}
              </button>
            </div>
            {testResult && (
              <div className={`mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm ${
                testResult.ok
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border border-red-200 text-red-800'}`}>
                <span className="text-base leading-none mt-0.5">{testResult.ok ? '✅' : '❌'}</span>
                <span>{testResult.msg}</span>
              </div>
            )}
          </Section>
        </>
      )}

      {/* ── Template ───────────────────────────────────────────── */}
      {tab === 'template' && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <h3 className="font-semibold text-slate-800 mb-1 text-sm">✉️ Template do E-mail de Cobrança</h3>
          <p className="text-xs text-slate-500 mb-3">Use as variáveis abaixo — substituídas automaticamente para cada inquilino.</p>

          {/* Chips de variáveis */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {VARS.map(v => (
              <button key={v.v}
                onClick={() => {
                  const el = document.getElementById('emailBodyTA')
                  if (el) {
                    const s = el.selectionStart, e2 = el.selectionEnd
                    const val = f.emailBody
                    set('emailBody', val.slice(0,s) + v.v + val.slice(e2))
                    setTimeout(() => { el.focus(); el.setSelectionRange(s+v.v.length, s+v.v.length) }, 10)
                  }
                }}
                className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-1 rounded-lg font-mono hover:bg-indigo-100 transition-colors">
                {v.v}
              </button>
            ))}
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            <button onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-2 border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50">
              👁 Pré-visualizar
            </button>
            <button
              onClick={() => {
                set('emailSubject', 'Boleto e NFS-e de {{mes}}/{{ano}} — {{imovel}}')
                set('emailBody', DEFAULT_BODY)
              }}
              className="flex items-center gap-2 border border-indigo-200 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors">
              ✨ Carregar template padrão de e-mail
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Assunto do e-mail</label>
              <input value={f.emailSubject} onChange={e => set('emailSubject', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Assunto…"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Corpo do e-mail</label>
              <textarea id="emailBodyTA" value={f.emailBody} onChange={e => set('emailBody', e.target.value)}
                rows={14}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
          </div>

          {/* Preview modal */}
          {previewOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4" onClick={() => setPreviewOpen(false)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">Pré-visualização do E-mail</p>
                    <p className="text-xs text-slate-400">Exemplo com dados de João Carlos Santos</p>
                  </div>
                  <button onClick={() => setPreviewOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
                </div>
                <div className="bg-slate-50 p-4">
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 text-xs text-slate-500 space-y-1">
                      <div><span className="font-semibold w-16 inline-block">De:</span>{f.fromName} &lt;{f.fromEmail}&gt;</div>
                      <div><span className="font-semibold w-16 inline-block">Para:</span>joao@email.com</div>
                      <div><span className="font-semibold w-16 inline-block">Assunto:</span><span className="text-slate-800">{renderPreview(f.emailSubject)}</span></div>
                    </div>
                    <div className="px-5 py-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-mono bg-white max-h-80 overflow-y-auto">
                      {renderPreview(f.emailBody)}
                    </div>
                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>📎</span><span>boleto-julho-2026.pdf</span>
                        <span className="ml-2">📎</span><span>nfse-julho-2026.pdf</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="px-5 py-4 border-t border-slate-100">
                  <button onClick={() => setPreviewOpen(false)}
                    className="w-full bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700">Fechar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── API ──────────────────────────────────────────────────── */}
      {tab === 'api' && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <h3 className="font-semibold text-slate-800 mb-4 text-sm">⚡ Integrações de API</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">OpenPIX — API Key</label>
              <Inp value={f.openPix} onChange={e => set('openPix', e.target.value)} type="password" placeholder="sk-prod-••••••••••••••••" mono/>
              <p className="text-xs text-slate-400 mt-1">Obtenha em app.openpix.com.br → Configurações → API.</p>
            </div>
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
              <span>⚠️</span>
              <span>O webhook do OpenPIX deve apontar para: <code className="font-mono bg-amber-100 px-1 rounded">https://app.imobinota.com.br/api/webhook/openpix</code></span>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400 leading-relaxed">
                A chave de API do Resend é configurada na aba <strong>E-mail</strong>.
                Mantenha todas as chaves em segurança — nunca as compartilhe ou exponha no front-end.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Botão salvar */}
      <button onClick={save} disabled={saving || loadingProfile}
        className={`w-full py-3 rounded-xl font-semibold text-white transition-all mt-2 disabled:opacity-60 ${saved ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
        {saving ? 'Salvando…' : saved ? '✓ Salvo com sucesso!' : 'Salvar Configurações'}
      </button>
    </div>
  )
}
