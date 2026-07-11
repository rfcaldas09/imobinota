import { useState } from 'react'

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

export default function Config() {
  const [tab, setTab]           = useState('empresa')
  const [saved, setSaved]       = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [testSending, setTestSending] = useState(false)

  const [f, setF] = useState({
    // Empresa
    company:   'Gestora Pro Imóveis Ltda',
    cnpj:      '12.345.678/0001-90',
    inscMun:   '123456-7',
    certOk:    true,
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

  const save = () => {
    setSaved(true)
    // toast global seria ideal — aqui usamos setTimeout
    setTimeout(() => setSaved(false), 2500)
  }

  const sendTest = () => {
    if (!f.testEmailAddr) return
    setTestSending(true)
    setTimeout(() => {
      setTestSending(false)
      // feedback via console para não depender do toast global
    }, 1800)
  }

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

  // ── Helpers ──────────────────────────────────────────────────
  const Section = ({ title, children }) => (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-4">
      <h3 className="font-semibold text-slate-800 mb-4 text-sm">{title}</h3>
      {children}
    </div>
  )

  const Row = ({ label, hint, children, cols='grid-cols-1' }) => (
    <div className={`grid ${cols} gap-3`}>
      <div>
        <label className="text-xs font-medium text-slate-500 block mb-1">{label}</label>
        {children}
        {hint && <p className="text-xs text-slate-400 mt-1 leading-snug">{hint}</p>}
      </div>
    </div>
  )

  const Inp = ({ k, type='text', placeholder='', mono=false, disabled=false }) => (
    <input value={f[k]} onChange={e => set(k, e.target.value)} type={type}
      placeholder={placeholder} disabled={disabled}
      className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg ${mono ? 'font-mono' : ''} ${disabled ? 'bg-slate-50 text-slate-400' : 'focus:outline-none focus:ring-2 focus:ring-indigo-500'}`}/>
  )

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
            <div className="space-y-3">
              <Row label="Razão Social"><Inp k="company" placeholder="Nome da empresa"/></Row>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">CNPJ</label>
                  <Inp k="cnpj" placeholder="00.000.000/0001-00"/>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Inscrição Municipal</label>
                  <Inp k="inscMun" placeholder="000000-0"/>
                </div>
              </div>
            </div>
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
                <Inp k="nbs" mono placeholder="x.xx.xx.xx.xx"/>
                <p className="text-xs text-slate-400 mt-1">1.05.01.09.00 = Administração de imóveis</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Alíquota ISS (%)</label>
                <Inp k="aliquota" placeholder="0,00"/>
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
              {[
                { id:'resend', name:'Resend', desc:'API moderna, alta entregabilidade. Recomendado.', badge:'Recomendado' },
                { id:'smtp',   name:'SMTP personalizado', desc:'Use o servidor de e-mail da própria empresa.', badge:'' },
              ].map(p => (
                <button key={p.id} onClick={() => set('emailProvider', p.id)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${f.emailProvider === p.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-slate-900">{p.name}</span>
                    {p.badge && <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-medium">{p.badge}</span>}
                  </div>
                  <p className="text-xs text-slate-500 leading-snug">{p.desc}</p>
                </button>
              ))}
            </div>
            {f.emailProvider === 'resend' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Resend — API Key</label>
                  <Inp k="resendKey" type="password" placeholder="re_••••••••••••••••" mono/>
                  <p className="text-xs text-slate-400 mt-1">Obtenha em resend.com → API Keys. Domínio precisa estar verificado.</p>
                </div>
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
                  <span>ℹ️</span>
                  <span>Para enviar pelo domínio do cliente, adicione os registros DNS do Resend no painel do provedor de domínio.</span>
                </div>
              </div>
            )}
            {f.emailProvider === 'smtp' && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-slate-500 block mb-1">Servidor SMTP</label>
                    <Inp k="smtpHost" placeholder="mail.suaempresa.com.br"/>
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
                  <div><label className="text-xs font-medium text-slate-500 block mb-1">Usuário SMTP</label><Inp k="smtpUser" placeholder="seu@email.com.br"/></div>
                  <div><label className="text-xs font-medium text-slate-500 block mb-1">Senha SMTP</label><Inp k="smtpPass" type="password" placeholder="••••••••"/></div>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Nome de exibição (From Name)</label>
                  <Inp k="fromName" placeholder="Nome da Empresa"/>
                  <p className="text-xs text-slate-400 mt-1">Ex: Vasselai Imóveis</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">E-mail remetente (From)</label>
                  <Inp k="fromEmail" type="email" placeholder="cobrancas@suaempresa.com.br"/>
                  <p className="text-xs text-slate-400 mt-1">Deve pertencer ao domínio verificado</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Responder para (Reply-To)</label>
                <Inp k="replyTo" type="email" placeholder="contato@suaempresa.com.br"/>
                <p className="text-xs text-slate-400 mt-1">Opcional — e-mail para onde respostas serão direcionadas</p>
              </div>
            </div>
          </Section>

          <Section title="🧪 Testar Envio">
            <p className="text-sm text-slate-500 mb-3">Envie um e-mail de teste com as configurações atuais para verificar a entregabilidade.</p>
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

          <div className="flex gap-2 mt-4">
            <button onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-2 border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50">
              👁 Pré-visualizar
            </button>
            <button onClick={() => set('emailBody', DEFAULT_BODY)}
              className="text-xs text-slate-400 hover:text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50">
              ↩ Restaurar padrão
            </button>
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
              <Inp k="openPix" type="password" placeholder="sk-prod-••••••••••••••••" mono/>
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
      <button onClick={save}
        className={`w-full py-3 rounded-xl font-semibold text-white transition-all mt-2 ${saved ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
        {saved ? '✓ Configurações Salvas!' : 'Salvar Configurações'}
      </button>
    </div>
  )
}
