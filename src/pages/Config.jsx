import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── Criptografia da senha do certificado (AES-128-CBC via SubtleCrypto) ─
async function encryptPassword(password, keyHex) {
  if (!keyHex || !password) return ''
  const keyBytes = hexToBytes(keyHex)
  const iv       = crypto.getRandomValues(new Uint8Array(16))
  const key      = await crypto.subtle.importKey('raw', keyBytes, { name:'AES-CBC' }, false, ['encrypt'])
  const enc      = await crypto.subtle.encrypt({ name:'AES-CBC', iv }, key, new TextEncoder().encode(password))
  return bytesToHex(iv) + bytesToHex(new Uint8Array(enc))
}
const hexToBytes = hex => new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)))
const bytesToHex = buf => Array.from(buf).map(b => b.toString(16).padStart(2,'0')).join('')

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

// Lista de municípios comuns do Sul para facilitar a busca
const MUNICIPIOS_SUL = [
  { ibge:'4202008', nome:'Blumenau — SC' },
  { ibge:'4205407', nome:'Florianópolis — SC' },
  { ibge:'4209102', nome:'Joinville — SC' },
  { ibge:'4214805', nome:'São José — SC' },
  { ibge:'4204202', nome:'Chapecó — SC' },
  { ibge:'4213500', nome:'São Bento do Sul — SC' },
  { ibge:'4211900', nome:'Palhoça — SC' },
  { ibge:'4307609', nome:'Porto Alegre — RS' },
  { ibge:'4304606', nome:'Caxias do Sul — RS' },
  { ibge:'4316907', nome:'Santa Maria — RS' },
  { ibge:'4313409', nome:'Pelotas — RS' },
  { ibge:'4309209', nome:'Gramado — RS' },
  { ibge:'4106902', nome:'Curitiba — PR' },
  { ibge:'4113700', nome:'Londrina — PR' },
  { ibge:'4115200', nome:'Maringá — PR' },
  { ibge:'4119905', nome:'Ponta Grossa — PR' },
  { ibge:'4104808', nome:'Cascavel — PR' },
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
  const [certUploading, setCertUploading] = useState(false)
  const [certMsg, setCertMsg]   = useState(null)         // { ok, msg }
  const certInputRef            = useRef(null)

  const [f, setF] = useState({
    // Empresa
    company:      '',
    cnpj:         '',
    inscMun:      '',
    telefone:     '',
    emailContato: '',
    endereco:     '',
    certOk:       false,
    certNome:     '',
    certValidade: '',
    certPassword: '',
    // Fiscal
    regime:    'simples',
    nbs:       '1.05.01.09.00',
    aliquota:  '5,00',
    // NFS-e
    municipioIbge: '',
    municipioNome: '',
    codigoServico: '6.05',
    serie:         'IMOB',
    logradouro:    '',
    numeroEnd:     '',
    bairro:        '',
    cep:           '',
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
    // API / Recebimentos
    pixKeyRecebimento: '',
    pixKeyType:        'cpf',
    subaccountCreated: false,
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
          certOk:       !!data?.nfse_cert_path,
          certNome:     data?.nfse_cert_path ? data.nfse_cert_path.split('/').pop() : '',
          certPassword: '',
          // Fiscal
          regime:   data?.regime_tributario  || 'simples',
          nbs:      data?.nbs_servico        || '',
          aliquota: data?.aliquota_iss       || '',
          // NFS-e
          municipioIbge: data?.nfse_municipio_ibge  || '',
          municipioNome: data?.nfse_municipio_nome  || '',
          codigoServico: data?.nfse_codigo_servico  || '6.05',
          serie:         data?.nfse_serie           || 'IMOB',
          logradouro:    data?.nfse_logradouro      || '',
          numeroEnd:     data?.nfse_numero_end      || '',
          bairro:        data?.nfse_bairro          || '',
          cep:           data?.nfse_cep             || '',
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
          // API / Recebimentos
          pixKeyRecebimento: data?.pix_key_recebimento   || '',
          pixKeyType:        data?.pix_key_type          || 'cpf',
          subaccountCreated: data?.openpix_subaccount_created || false,
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
        regime_tributario:  f.regime,
        nbs_servico:        f.nbs,
        aliquota_iss:       f.aliquota,
        // NFS-e
        nfse_municipio_ibge: f.municipioIbge,
        nfse_municipio_nome: f.municipioNome,
        nfse_codigo_servico: f.codigoServico,
        nfse_serie:          f.serie,
        nfse_logradouro:     f.logradouro,
        nfse_numero_end:     f.numeroEnd,
        nfse_bairro:         f.bairro,
        nfse_cep:            f.cep,
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
      // Se a chave PIX foi preenchida, cria/atualiza a subconta no OpenPIX
      if (f.pixKeyRecebimento) {
        try {
          const subRes = await fetch('/.netlify/functions/openpix-create-subaccount', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: f.company || 'Cliente ImobiNota', pixKey: f.pixKeyRecebimento }),
          })
          const subData = await subRes.json()
          if (!subRes.ok && subRes.status !== 404) {
            // 404 = function não deployada ainda (dev local) — ignora
            setSaving(false)
            setSaved(false)
            alert(`Erro ao validar chave PIX: ${subData.error || 'Verifique a chave e tente novamente.'}`)
            return
          }
          Object.assign(payload, { openpix_subaccount_created: true })
        } catch {
          // offline ou dev local — salva mesmo assim
        }
      }
      Object.assign(payload, {
        pix_key_recebimento: f.pixKeyRecebimento,
        pix_key_type:        f.pixKeyType,
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
          <Section title="🔐 Certificado Digital A1 (e-CNPJ / e-CPF)">
            {/* Arquivo .pfx oculto */}
            <input ref={certInputRef} type="file" accept=".pfx,.p12"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file || !user) return
                setCertUploading(true)
                setCertMsg(null)
                try {
                  // Sobe o arquivo para Supabase Storage: certificados-nfse/{userId}/{filename}
                  const path = `${user.id}/${Date.now()}_${file.name}`
                  const { error } = await supabase.storage
                    .from('certificados-nfse')
                    .upload(path, file, { upsert: true, contentType: 'application/x-pkcs12' })
                  if (error) throw error

                  // Criptografa a senha (se houver) com a chave de ambiente
                  // Nota: NFSE_CERT_KEY precisa estar configurado no .env e no Netlify
                  let encPassword = ''
                  if (f.certPassword) {
                    const keyHex = import.meta.env.VITE_NFSE_CERT_KEY || ''
                    encPassword = keyHex ? await encryptPassword(f.certPassword, keyHex) : ''
                  }

                  // Grava path e senha criptografada no profile
                  await supabase.from('profiles').upsert({
                    id: user.id,
                    nfse_cert_path: path,
                    ...(encPassword ? { nfse_cert_password_enc: encPassword } : {}),
                  })

                  set('certOk', true)
                  set('certNome', file.name)
                  set('certPassword', '') // limpa senha da UI
                  setCertMsg({ ok: true, msg: `${file.name} enviado com sucesso.` })
                } catch (err) {
                  setCertMsg({ ok: false, msg: err.message || 'Erro ao enviar certificado.' })
                } finally {
                  setCertUploading(false)
                  e.target.value = '' // reset input
                }
              }}
            />

            {f.certOk ? (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-3">
                <span className="text-xl">✅</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-emerald-800">Certificado configurado</p>
                  <p className="text-xs text-emerald-600 truncate">{f.certNome || 'certificado.pfx'}</p>
                </div>
                <button
                  onClick={() => certInputRef.current?.click()}
                  className="text-xs text-indigo-600 hover:underline font-medium">
                  Substituir
                </button>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center mb-3 hover:border-indigo-300 transition-colors cursor-pointer"
                onClick={() => certInputRef.current?.click()}>
                <p className="text-2xl mb-1">📁</p>
                <p className="text-slate-500 text-sm font-medium">Clique para selecionar o arquivo .pfx</p>
                <p className="text-slate-400 text-xs mt-0.5">Certificado A1 do e-CNPJ ou e-CPF</p>
              </div>
            )}

            {/* Senha do certificado */}
            <div className="mb-3">
              <label className="text-xs font-medium text-slate-500 block mb-1">
                Senha do certificado
              </label>
              <input
                value={f.certPassword}
                onChange={e => set('certPassword', e.target.value)}
                type="password"
                placeholder="Senha usada ao exportar o .pfx"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-slate-400 mt-1">
                A senha é criptografada (AES-128) antes de ser salva. Nunca é exposta em texto simples.
              </p>
            </div>

            {certUploading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                <div className="w-3 h-3 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin"/>
                Enviando certificado…
              </div>
            )}
            {certMsg && (
              <div className={`text-xs rounded-lg px-3 py-2 mb-2 ${certMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {certMsg.msg}
              </div>
            )}

            <button
              onClick={() => certInputRef.current?.click()}
              disabled={certUploading}
              className="w-full py-2 rounded-lg border border-indigo-200 text-indigo-600 text-sm font-medium hover:bg-indigo-50 disabled:opacity-40">
              {certUploading ? 'Enviando…' : f.certOk ? '↑ Substituir certificado' : '↑ Enviar certificado .pfx'}
            </button>

            <p className="text-xs text-slate-400 mt-2">
              Armazenado em bucket privado no Supabase (AES-128). Nunca exposto via API pública.
            </p>
          </Section>
        </>
      )}

      {/* ── Fiscal ─────────────────────────────────────────────── */}
      {tab === 'fiscal' && (
        <>
          <Section title="📄 Tributação">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Regime Tributário</label>
                <select value={f.regime} onChange={e => set('regime', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="simples">Simples Nacional</option>
                  <option value="presumido">Lucro Presumido</option>
                  <option value="real">Lucro Real</option>
                  <option value="mei">MEI</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Alíquota ISS (%)</label>
                  <Inp value={f.aliquota} onChange={e => set('aliquota', maskAliquota(e.target.value))} placeholder="2,00"/>
                  <p className="text-xs text-slate-400 mt-1">Ex: 2,00 para administração de imóveis</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Cód. NBS (opcional)</label>
                  <Inp value={f.nbs} onChange={e => set('nbs', maskNbs(e.target.value))} mono placeholder="1.05.01.09.00"/>
                  <p className="text-xs text-slate-400 mt-1">1.05.01.09.00 = Adm. imóveis</p>
                </div>
              </div>
            </div>
          </Section>

          <Section title="🏛️ NFS-e — Dados de Emissão">
            <div className="space-y-3">

              {/* Município */}
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Município de prestação do serviço</label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={f.municipioIbge}
                    onChange={e => {
                      const opt = MUNICIPIOS_SUL.find(m => m.ibge === e.target.value)
                      set('municipioIbge', e.target.value)
                      set('municipioNome', opt?.nome || '')
                    }}>
                    <option value="">— Selecione o município —</option>
                    {MUNICIPIOS_SUL.map(m => (
                      <option key={m.ibge} value={m.ibge}>{m.nome}</option>
                    ))}
                    <option value="outro">Outro (digitar IBGE abaixo)</option>
                  </select>
                </div>
                {(f.municipioIbge === 'outro' || (f.municipioIbge && !MUNICIPIOS_SUL.find(m => m.ibge === f.municipioIbge))) && (
                  <div className="mt-2">
                    <Inp value={f.municipioIbge === 'outro' ? '' : f.municipioIbge}
                      onChange={e => set('municipioIbge', e.target.value.replace(/\D/g,'').slice(0,7))}
                      mono placeholder="Código IBGE (7 dígitos)"/>
                    <p className="text-xs text-slate-400 mt-1">Consulte: ibge.gov.br/cidades-e-estados</p>
                  </div>
                )}
              </div>

              {/* Código serviço LC 116 e Série */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Código serviço LC 116</label>
                  <select value={f.codigoServico} onChange={e => set('codigoServico', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="6.05">6.05 — Agenciamento de imóveis</option>
                    <option value="11.04">11.04 — Administração de negócios</option>
                    <option value="17.06">17.06 — Assessoria, análise, consultoria</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Série DPS</label>
                  <Inp value={f.serie} onChange={e => set('serie', e.target.value.toUpperCase().slice(0,5))}
                    mono placeholder="IMOB"/>
                  <p className="text-xs text-slate-400 mt-1">Máx. 5 chars (ex: IMOB)</p>
                </div>
              </div>

              {/* Endereço completo do prestador (para DPS) */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Endereço do prestador (para a DPS)</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-slate-500 block mb-1">Logradouro</label>
                      <Inp value={f.logradouro} onChange={e => set('logradouro', e.target.value)} placeholder="Rua das Flores"/>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1">Número</label>
                      <Inp value={f.numeroEnd} onChange={e => set('numeroEnd', e.target.value)} placeholder="100"/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1">Bairro</label>
                      <Inp value={f.bairro} onChange={e => set('bairro', e.target.value)} placeholder="Centro"/>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1">CEP</label>
                      <Inp value={f.cep} onChange={e => set('cep', e.target.value.replace(/\D/g,'').slice(0,8))}
                        mono placeholder="89010000"/>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* Status de prontidão para emitir NFS-e */}
          {(() => {
            const ok = f.cnpj && f.inscMun && f.municipioIbge && f.certOk && f.aliquota
            return (
              <div className={`rounded-xl px-4 py-3 text-xs ${ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
                {ok ? (
                  <span>✅ Configuração completa — pronto para emitir NFS-e.</span>
                ) : (
                  <span>
                    ⚠️ Para emitir NFS-e, você precisa de: {[
                      !f.cnpj && 'CNPJ/CPF',
                      !f.inscMun && 'Inscrição Municipal',
                      !f.municipioIbge && 'Código IBGE',
                      !f.certOk && 'Certificado A1',
                      !f.aliquota && 'Alíquota ISS',
                    ].filter(Boolean).join(', ')}.
                    Configure em <strong>Empresa</strong> ou nas abas acima.
                  </span>
                )}
              </div>
            )
          })()}
        </>
      )}

      {/* ── E-mail ─────────────────────────────────────────────── */}
      {tab === 'email' && (
        <>
          <Section title="✉️ Identidade do Remetente">
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 text-xs text-emerald-700">
                <span>✅</span>
                <span>O envio é feito pela infraestrutura do ImobiNota — configure apenas o nome e o e-mail de resposta abaixo.</span>
              </div>
              <Row label="Nome de exibição" hint='Aparece no campo "De:" para o inquilino'>
                <Inp value={f.fromName} onChange={e => set('fromName', e.target.value)} placeholder="Ex: Vasselai Imóveis"/>
              </Row>
              <Row label="Responder para (Reply-To)" hint="Quando o inquilino responder, a mensagem chega neste endereço">
                <Inp value={f.replyTo} onChange={e => set('replyTo', e.target.value)} type="email" placeholder="contato@suaempresa.com.br"/>
              </Row>
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
        <div className="space-y-4">
          {/* Banner de status */}
          {f.subaccountCreated ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
              <span className="text-lg">✅</span>
              <div>
                <p className="font-semibold">Conta de recebimento configurada</p>
                <p className="text-xs text-emerald-600 mt-0.5">Os pagamentos dos seus inquilinos serão transferidos automaticamente para sua chave PIX.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-semibold">Chave PIX não configurada</p>
                <p className="text-xs text-amber-600 mt-0.5">Configure sua chave PIX abaixo para receber os pagamentos dos seus inquilinos.</p>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-100 rounded-2xl p-5">
            <h3 className="font-semibold text-slate-800 mb-1 text-sm">🏦 Conta para recebimento</h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Informe a chave PIX da sua conta (Itaú ou qualquer banco). Os pagamentos dos inquilinos
              serão transferidos automaticamente para esta conta após cada boleto pago — sem nenhuma ação manual sua.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Tipo de chave PIX</label>
                <select
                  value={f.pixKeyType}
                  onChange={e => set('pixKeyType', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                  <option value="email">E-mail</option>
                  <option value="telefone">Telefone</option>
                  <option value="aleatoria">Chave aleatória (EVP)</option>
                </select>
              </div>

              <Row
                label="Chave PIX"
                hint={
                  f.pixKeyType === 'cpf'       ? 'Ex: 123.456.789-00' :
                  f.pixKeyType === 'cnpj'      ? 'Ex: 12.345.678/0001-90' :
                  f.pixKeyType === 'email'     ? 'Ex: financeiro@suaempresa.com.br' :
                  f.pixKeyType === 'telefone'  ? 'Ex: +5547999998888' :
                  'Cole a chave aleatória gerada pelo seu banco'
                }>
                <Inp
                  value={f.pixKeyRecebimento}
                  onChange={e => set('pixKeyRecebimento', e.target.value)}
                  placeholder={
                    f.pixKeyType === 'cpf'       ? '123.456.789-00' :
                    f.pixKeyType === 'cnpj'      ? '12.345.678/0001-90' :
                    f.pixKeyType === 'email'     ? 'financeiro@empresa.com.br' :
                    f.pixKeyType === 'telefone'  ? '+5547999998888' :
                    'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
                  }
                  mono
                />
              </Row>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-5">
            <h3 className="font-semibold text-slate-800 mb-3 text-sm">ℹ️ Como funciona</h3>
            <ol className="space-y-2 text-xs text-slate-500 leading-relaxed">
              <li className="flex gap-2"><span className="font-bold text-indigo-600 shrink-0">1.</span>Seu inquilino recebe o boleto e paga via PIX.</li>
              <li className="flex gap-2"><span className="font-bold text-indigo-600 shrink-0">2.</span>O ImobiNota retém a taxa de serviço de R$ 2,99 por boleto pago.</li>
              <li className="flex gap-2"><span className="font-bold text-indigo-600 shrink-0">3.</span>O restante é transferido instantaneamente para a sua chave PIX acima.</li>
              <li className="flex gap-2"><span className="font-bold text-indigo-600 shrink-0">4.</span>Você vê tudo no dashboard em tempo real. Nenhuma ação manual necessária.</li>
            </ol>
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
