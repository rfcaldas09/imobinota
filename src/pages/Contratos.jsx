import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { emitirUmaCobranca, mesLabel, MESES } from '../lib/cobrancas'
import MonthPicker from '../components/MonthPicker'
import Badge from '../components/Badge'

const ic = (d, cls='') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${cls}`}
    dangerouslySetInnerHTML={{ __html: d }} />
)
const IcSearch  = ({ c='' }) => ic('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', c)
const IcPlus    = ({ c='' }) => ic('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', c)
const IcSend    = ({ c='' }) => ic('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>', c)
const IcX       = ({ c='' }) => ic('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', c)
const IcCheck   = ({ c='' }) => ic('<polyline points="20 6 9 17 4 12"/>', c)
const IcMail    = ({ c='' }) => ic('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>', c)
const IcPencil  = ({ c='' }) => ic('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', c)
const IcChevR   = ({ c='' }) => ic('<polyline points="9 18 15 12 9 6"/>', c)
const IcChevL   = ({ c='' }) => ic('<polyline points="15 18 9 12 15 6"/>', c)
const IcZap     = ({ c='' }) => ic('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', c)
const IcScan    = ({ c='' }) => ic('<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="3" y1="12" x2="21" y2="12"/>', c)
const IcTrash   = ({ c='' }) => ic('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', c)

const fmt     = v => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

// ── Máscaras de input ──────────────────────────────────────────────
const digits = v => v.replace(/\D/g, '')

const maskCpfCnpj = raw => {
  const d = digits(raw).slice(0, 14)
  if (d.length <= 11) {
    // CPF: 000.000.000-00
    if (d.length <= 3) return d
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
  }
  // CNPJ: 00.000.000/0000-00
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
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}` // celular: (00) 00000-0000
}

const isCpfCnpjValid = v => {
  const d = digits(v)
  return d.length === 0 || d.length === 11 || d.length === 14
}
const isPhoneValid = v => {
  const d = digits(v)
  return d.length === 0 || d.length === 10 || d.length === 11
}

const FILTERS  = ['Todos', 'Pago', 'Pendente', 'Em Atraso', 'Por Vencer']
const PER_PAGE = 10

const isExpiringSoon = (c) => {
  if (!c.end) return false
  const diff = (new Date(c.end) - new Date()) / 86400000
  return diff >= 0 && diff <= 60
}

// ── Componentes do formulário (fora do ContractForm para não perder foco) ──
function FormInp({ value, onChange, invalid, ...rest }) {
  const border = invalid
    ? 'border-red-400 focus:ring-red-300'
    : 'border-slate-200 focus:ring-indigo-500'
  return (
    <input value={value ?? ''} onChange={onChange}
      className={`w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 transition-colors ${border}`}
      {...rest} />
  )
}

function Row({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 block mb-1">{label}</label>
      {children}
    </div>
  )
}

// ── Formulário compartilhado (Novo / Editar) ──────────────────────
function ContractForm({ initial, onSave, onClose, title, saveLabel, accentColor = 'bg-indigo-500', saving }) {
  const blank = {
    tenant: '', cpf: '', property: '', value: '', seguroFinanceiro: '0',
    seguroIncendio: '0', iptu: '0', dueDay: '10',
    email: '', phone: '', start: new Date().toISOString().slice(0,10),
    end: '', status: 'Pendente',
  }
  const [f, setF] = useState({ ...blank, ...initial })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    const handle = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose])

  const totalValue = (parseFloat(f.value)||0) + (parseFloat(f.seguroFinanceiro)||0) +
                     (parseFloat(f.seguroIncendio)||0) + (parseFloat(f.iptu)||0)

  const handle = () => {
    if (!f.tenant || !f.property || !f.value) return
    onSave({
      ...f,
      value:            parseFloat(f.value)||0,
      seguroFinanceiro: parseFloat(f.seguroFinanceiro)||0,
      seguroIncendio:   parseFloat(f.seguroIncendio)||0,
      iptu:             parseFloat(f.iptu)||0,
      totalValue,
      dueDay:           parseInt(f.dueDay)||10,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className={`h-1.5 ${accentColor}`} />
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="font-bold text-slate-900 text-lg">{title}</h3>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600"><IcX c="w-5 h-5"/></button>
        </div>

        <div className="overflow-y-auto px-6 pb-2 space-y-3 flex-1">
          {/* Inquilino */}
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide pt-1">Inquilino</p>
          <div className="grid grid-cols-2 gap-3">
            <Row label="Nome Completo *">
              <FormInp value={f.tenant} onChange={e => set('tenant', e.target.value)} placeholder="Nome completo"/>
            </Row>
            <Row label={`CPF / CNPJ${f.cpf && !isCpfCnpjValid(f.cpf) ? ' — incompleto' : ''}`}>
              <FormInp
                value={f.cpf}
                onChange={e => set('cpf', maskCpfCnpj(e.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
                invalid={f.cpf && !isCpfCnpjValid(f.cpf)}
              />
            </Row>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Row label="E-mail">
              <FormInp value={f.email} onChange={e => set('email', e.target.value)} type="email" placeholder="inquilino@email.com"/>
            </Row>
            <Row label={`Telefone${f.phone && !isPhoneValid(f.phone) ? ' — incompleto' : ''}`}>
              <FormInp
                value={f.phone}
                onChange={e => set('phone', maskPhone(e.target.value))}
                placeholder="(47) 99999-0000"
                inputMode="numeric"
                invalid={f.phone && !isPhoneValid(f.phone)}
              />
            </Row>
          </div>

          {/* Imóvel */}
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide pt-1">Imóvel</p>
          <Row label="Identificação do Imóvel *">
            <FormInp value={f.property} onChange={e => set('property', e.target.value)} placeholder="Ex: Ap. 201 — R. XV de Novembro, 450"/>
          </Row>
          <div className="grid grid-cols-2 gap-3">
            <Row label="Início do Contrato">
              <FormInp value={f.start} onChange={e => set('start', e.target.value)} type="date"/>
            </Row>
            <Row label="Fim do Contrato">
              <FormInp value={f.end} onChange={e => set('end', e.target.value)} type="date"/>
            </Row>
          </div>

          {/* Composição financeira */}
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide pt-1">Composição do Boleto</p>
          <div className="grid grid-cols-2 gap-3">
            <Row label="Aluguel (R$) *">
              <FormInp value={f.value} onChange={e => set('value', e.target.value)} type="number" placeholder="0,00"/>
            </Row>
            <Row label="Seguro Financeiro (R$)">
              <FormInp value={f.seguroFinanceiro} onChange={e => set('seguroFinanceiro', e.target.value)} type="number" placeholder="0,00"/>
            </Row>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Row label="Seguro Incêndio (R$)">
              <FormInp value={f.seguroIncendio} onChange={e => set('seguroIncendio', e.target.value)} type="number" placeholder="0,00"/>
            </Row>
            <Row label="IPTU (R$)">
              <FormInp value={f.iptu} onChange={e => set('iptu', e.target.value)} type="number" placeholder="0,00"/>
            </Row>
          </div>

          {/* Total calculado */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex justify-between items-center">
            <div>
              <p className="text-xs text-indigo-600 font-semibold">Valor Total do Boleto</p>
              <p className="text-xs text-indigo-400">Calculado automaticamente</p>
            </div>
            <p className="text-xl font-bold text-indigo-800 tabular-nums">{fmt(totalValue)}</p>
          </div>

          {/* Vencimento e status */}
          <div className="grid grid-cols-2 gap-3 pb-2">
            <Row label="Dia de Vencimento">
              <FormInp value={f.dueDay} onChange={e => set('dueDay', e.target.value)} type="number" min="1" max="28"/>
            </Row>
            <Row label="Status">
              <select value={f.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {['Pendente','Pago','Em Atraso'].map(s => <option key={s}>{s}</option>)}
              </select>
            </Row>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handle} disabled={!f.tenant || !f.property || !f.value || saving}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {saving ? 'Salvando…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Preview de boleto / NFS-e ─────────────────────────────────────
function DocModal({ type, contract: c, onClose, onToast }) {
  const { user }   = useAuth()
  const isBoleto   = type === 'boleto'
  const now        = new Date()
  const dueStr     = `${String(c.dueDay).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`

  // Estado do picker e da emissão (apenas para boleto)
  const [mesRef, setMesRef]   = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  const [emitindo, setEmitindo] = useState(false)
  const [emissao, setEmissao]   = useState(null) // null | 'created' | 'already' | 'error'

  useEffect(() => {
    const handle = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose])

  const emitir = async () => {
    if (!user) return
    setEmitindo(true)
    const res = await emitirUmaCobranca(user.id, c, mesRef)
    setEmitindo(false)
    if (res.error)   { setEmissao('error');   onToast('Erro ao registrar cobrança', 'error'); return }
    if (res.already) { setEmissao('already'); return }
    setEmissao('created')
    onToast(`Cobrança de ${mesLabel(mesRef)} registrada para ${c.tenant}`, 'success')
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className={`h-1.5 ${isBoleto ? 'bg-blue-500' : 'bg-emerald-500'}`}/>
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <span className={`text-xs font-bold uppercase tracking-widest ${isBoleto?'text-blue-600':'text-emerald-600'}`}>
                {isBoleto ? '💳 Boleto de Cobrança' : '📄 NFS-e — Nota Fiscal de Serviço'}
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {isBoleto ? 'Via OpenPIX / Banco Inter' : 'API Nacional NFS-e — Gov.br'}
              </h3>
            </div>
            <button onClick={onClose} className="text-slate-300 hover:text-slate-600 mt-1"><IcX c="w-5 h-5"/></button>
          </div>

          {/* Dados do documento */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-100 text-sm mb-4">
            {[
              [isBoleto ? 'Pagador' : 'Tomador', c.tenant],
              ['Imóvel', c.property],
              [isBoleto ? 'Vencimento' : 'Competência',
               isBoleto ? dueStr : now.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between px-4 py-2.5">
                <span className="text-slate-500">{k}</span>
                <span className="font-medium text-slate-800 text-right max-w-[60%] truncate">{v}</span>
              </div>
            ))}
          </div>

          {/* Composição (boleto) */}
          {isBoleto && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Composição do Boleto</p>
              </div>
              <div className="divide-y divide-slate-50 text-sm">
                {[
                  ['Aluguel', c.value],
                  ...(c.seguroFinanceiro > 0 ? [['Seguro Financeiro', c.seguroFinanceiro]] : []),
                  ...(c.seguroIncendio   > 0 ? [['Seguro Incêndio',   c.seguroIncendio]]   : []),
                  ...(c.iptu             > 0 ? [['IPTU',               c.iptu]]             : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between px-4 py-2">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-medium text-slate-700">{fmt(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2.5 bg-indigo-50">
                  <span className="font-semibold text-indigo-800">Total a Pagar</span>
                  <span className="font-bold text-indigo-900">{fmt(c.totalValue)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Seletor de mês + status de emissão (apenas boleto) */}
          {isBoleto && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-slate-500 mb-2">Mês de referência da cobrança</p>
              <MonthPicker value={mesRef} onChange={v => { setMesRef(v); setEmissao(null) }}/>
              {emissao === 'already' && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
                  ⚠️ Cobrança já emitida para <strong>{mesLabel(mesRef)}</strong>. Selecione outro mês ou feche.
                </div>
              )}
              {emissao === 'created' && (
                <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs text-emerald-700">
                  ✅ Cobrança registrada para <strong>{mesLabel(mesRef)}</strong>. Envio de e-mail disponível em breve.
                </div>
              )}
            </div>
          )}

          {!isBoleto && (
            <p className="text-center text-xs text-slate-400 italic mb-4">
              🔧 Integração NFS-e Nacional em breve.
            </p>
          )}

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
              Fechar
            </button>
            {isBoleto ? (
              <button onClick={emitir} disabled={emitindo || emissao === 'created'}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {emitindo
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Registrando…</>
                  : emissao === 'created'
                  ? <><IcCheck c="w-4 h-4"/> Cobrança Registrada</>
                  : <><IcSend c="w-4 h-4"/> Registrar e Enviar</>
                }
              </button>
            ) : (
              <button onClick={() => { onClose(); onToast('NFS-e em breve disponível', 'info') }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 flex items-center justify-center gap-2">
                📄 Emitir NFS-e
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Batch Modal ────────────────────────────────────────────────────
function BatchModal({ total: totalContracts, onClose }) {
  const [step, setStep]         = useState('idle')
  const [progress, setProgress] = useState(0)
  const [logs, setLogs]         = useState([])
  const [fails, setFails]       = useState(0)

  useEffect(() => {
    if (step === 'running') return
    const handle = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose, step])

  const run = () => {
    setStep('running')
    let sent = 0, fc = 0
    const names = ['Maria Aparecida','João Carlos','Ana Paula','Carlos Eduardo','Fernanda Oliveira']
    const iv = setInterval(() => {
      const batch = Math.min(5, totalContracts - sent)
      for (let i = 0; i < batch; i++) {
        const fail = Math.random() < 0.005
        if (fail) fc++
        setLogs(l => [...l.slice(-50), { name: names[(sent+i) % names.length], ok: !fail }])
      }
      sent = Math.min(sent + batch, totalContracts)
      setProgress(sent)
      setFails(fc)
      if (sent >= totalContracts) { clearInterval(iv); setTimeout(() => setStep('done'), 500) }
    }, 80)
  }

  const pct = totalContracts > 0 ? Math.round((progress / totalContracts) * 100) : 0

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {step === 'idle' && (
          <div className="p-7">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mb-5 text-3xl">🚀</div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Gerar e Enviar em Massa</h2>
            <p className="text-slate-500 mb-4 text-sm">Para cada um dos <strong className="text-slate-700">{totalContracts} contratos ativos</strong>, a plataforma irá:</p>
            <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-2">
              {[['💳','Gerar boleto de cobrança','via OpenPIX'],
                ['📄','Emitir Nota Fiscal de Serviço (NFS-e)','via API Nacional gov.br'],
                ['📧','Enviar e-mail com ambos os documentos','para o inquilino']].map(([ico,txt,sub])=>(
                <div key={txt} className="flex items-start gap-3 text-sm">
                  <span className="text-lg leading-none mt-0.5">{ico}</span>
                  <div><span className="text-slate-800 font-medium">{txt}</span><span className="text-slate-400 ml-1.5 text-xs">{sub}</span></div>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-sm text-amber-700">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>Mês de referência: <strong>{new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</strong>. Contratos já emitidos serão ignorados.</span>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50">Cancelar</button>
              <button onClick={run} disabled={totalContracts === 0}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold hover:from-indigo-700 hover:to-purple-700 flex items-center justify-center gap-2 shadow-md shadow-indigo-200 disabled:opacity-40">
                <IcZap c="w-4 h-4"/> Confirmar e Enviar
              </button>
            </div>
          </div>
        )}
        {step === 'running' && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"/>
              </div>
              <div>
                <p className="font-bold text-slate-900">Processando contratos…</p>
                <p className="text-sm text-slate-400">Não feche esta janela</p>
              </div>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-slate-600">{progress} <span className="text-slate-400">de {totalContracts}</span></span>
                <span className="font-bold text-indigo-600">{pct}%</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all" style={{ width:`${pct}%` }}/>
              </div>
            </div>
            <div className="bg-slate-950 rounded-xl p-3 h-48 overflow-y-auto font-mono text-xs space-y-1">
              {logs.slice(-30).map((l,i) => (
                <div key={i} className={l.ok ? 'text-emerald-400' : 'text-red-400'}>
                  {l.ok ? '✓' : '✗'} {l.ok ? 'Boleto + NFS-e enviados para' : 'Falha ao enviar para'} {l.name}
                </div>
              ))}
            </div>
          </div>
        )}
        {step === 'done' && (
          <div className="p-7 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <IcCheck c="w-8 h-8 text-emerald-600"/>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Envio concluído!</h2>
            <p className="text-slate-500 text-sm mb-5">
              {totalContracts - fails} enviados com sucesso
              {fails > 0 && <span className="text-red-500"> · {fails} falhas</span>}
            </p>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800">Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Scan Modal ────────────────────────────────────────────────────
function ScanModal({ contract: c, onClose, onToast }) {
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (phase !== 'idle') return
    const handle = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose, phase])

  const start = () => {
    setPhase('scanning')
    let p = 0
    const iv = setInterval(() => {
      p = Math.min(p + Math.random() * 12, 100)
      setProgress(Math.round(p))
      if (p >= 100) { clearInterval(iv); setTimeout(() => setPhase('done'), 400) }
    }, 150)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={phase === 'idle' ? onClose : undefined}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="h-1.5 bg-slate-700"/>
        <div className="p-6">
          {phase === 'idle' && (
            <>
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                <IcScan c="w-7 h-7 text-slate-600"/>
              </div>
              <h3 className="font-bold text-slate-900 text-lg mb-1">Escanear Contrato</h3>
              <p className="text-sm text-slate-500 mb-4">
                Inquilino: <strong className="text-slate-800">{c.tenant}</strong><br/>
                Imóvel: {c.property}
              </p>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center mb-4">
                <IcScan c="w-8 h-8 text-slate-300 mx-auto mb-3"/>
                <p className="text-sm text-slate-400">Arraste o PDF do contrato aqui ou</p>
                <button onClick={start} className="text-indigo-600 text-sm font-medium hover:underline mt-1">clique para selecionar</button>
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancelar</button>
                <button onClick={start} className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 flex items-center justify-center gap-2">
                  <IcScan c="w-4 h-4"/> Escanear
                </button>
              </div>
            </>
          )}
          {phase === 'scanning' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <div className="w-7 h-7 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"/>
              </div>
              <p className="font-bold text-slate-900 mb-1">Analisando documento…</p>
              <p className="text-xs text-slate-400 mb-4">OCR + extração de dados com IA</p>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-1">
                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{width:`${progress}%`}}/>
              </div>
              <p className="text-xs text-slate-400">{progress}%</p>
            </div>
          )}
          {phase === 'done' && (
            <>
              <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
                <IcCheck c="w-7 h-7 text-emerald-600"/>
              </div>
              <h3 className="font-bold text-slate-900 text-lg mb-1">Escaneamento concluído!</h3>
              <p className="text-sm text-slate-500 mb-4">Dados extraídos e vinculados ao contrato.</p>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm mb-4">
                {[['Inquilino',c.tenant],['Imóvel',c.property],
                  ['Vigência',`${fmtDate(c.start)} → ${fmtDate(c.end)}`],
                  ['Valor',fmt(c.value)]].map(([k,v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-medium text-slate-700 text-right max-w-[65%] truncate">{v}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => { onClose(); onToast(`Contrato de ${c.tenant} escaneado com sucesso!`, 'success') }}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Concluir</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal de confirmação de exclusão ──────────────────────────────
function DeleteModal({ contract: c, onConfirm, onClose, deleting }) {
  useEffect(() => {
    const handle = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
          <IcTrash c="w-6 h-6 text-red-600"/>
        </div>
        <h3 className="font-bold text-slate-900 text-lg mb-1">Excluir Contrato</h3>
        <p className="text-sm text-slate-500 mb-5">
          Tem certeza que deseja excluir o contrato de <strong className="text-slate-800">{c.tenant}</strong>? Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancelar</button>
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
            {deleting ? 'Excluindo…' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Drawer de detalhe do contrato ─────────────────────────────────
function ContractDrawer({ contract: c, onClose, onEdit, onScan, onDelete, onToast }) {
  const [docType, setDocType] = useState(null)

  useEffect(() => {
    const handle = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-50 flex">
        <div className="flex-1 bg-black/30" onClick={onClose}/>
        <div className="w-full max-w-sm bg-white h-full shadow-2xl overflow-y-auto flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-900">Detalhes do Contrato</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><IcX c="w-5 h-5"/></button>
          </div>
          <div className="p-5 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-lg font-bold">
                {c.tenant[0]}
              </div>
              <div>
                <p className="font-semibold text-slate-900">{c.tenant}</p>
                <p className="text-xs text-slate-500">{c.cpf || 'CPF não informado'}</p>
              </div>
            </div>

            <div className="space-y-2">
              {[
                ['Imóvel', c.property],
                ['E-mail', c.email || '—'],
                ['Telefone', c.phone || '—'],
                ['Vencimento', `Dia ${c.dueDay} de cada mês`],
                ['Início', fmtDate(c.start)],
                ['Término', fmtDate(c.end)],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-2 text-sm">
                  <span className="text-slate-400 w-24 flex-shrink-0">{label}</span>
                  <span className="text-slate-700 font-medium">{value}</span>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Composição do Boleto</p>
              {[['Aluguel', c.value],
                ['Seg. Financeiro', c.seguroFinanceiro],
                ['Seg. Incêndio', c.seguroIncendio],
                ['IPTU', c.iptu]].map(([l,v]) => v > 0 && (
                <div key={l} className="flex justify-between text-sm">
                  <span className="text-slate-500">{l}</span>
                  <span className="text-slate-700">{fmt(v)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-2 mt-1">
                <span className="text-slate-900">Total</span>
                <span className="text-indigo-700">{fmt(c.totalValue)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Status atual</span>
              <Badge status={c.status}/>
            </div>

            <div className="space-y-2 pt-1">
              <button onClick={() => setDocType('boleto')}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors">
                <IcSend c="w-4 h-4"/> Enviar Cobrança (Boleto)
              </button>
              <button onClick={() => setDocType('nfse')}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors">
                📄 Emitir NFS-e
              </button>
              <button onClick={() => { onClose(); onEdit(c) }}
                className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-700 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors">
                <IcPencil c="w-4 h-4"/> Editar Contrato
              </button>
              <button onClick={() => { onClose(); onScan(c) }}
                className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-700 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors">
                <IcScan c="w-4 h-4"/> Escanear Contrato
              </button>
              <button onClick={() => { onToast(`Lembrete enviado para ${c.email || c.tenant}`, 'success') }}
                className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-700 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors">
                <IcMail c="w-4 h-4"/> Enviar Lembrete
              </button>
              <button onClick={() => { onClose(); onDelete(c) }}
                className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 py-2.5 rounded-xl font-semibold text-sm hover:bg-red-100 transition-colors">
                <IcTrash c="w-4 h-4"/> Excluir Contrato
              </button>
            </div>
          </div>
        </div>
      </div>
      {docType && <DocModal type={docType} contract={c} onClose={() => setDocType(null)} onToast={onToast}/>}
    </>
  )
}

// ── Toast local ────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([])
  const add = (msg, type='success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }
  const remove = id => setToasts(t => t.filter(x => x.id !== id))
  return { toasts, toast: add, remove }
}

function ToastArea({ toasts }) {
  const colors = { success:'bg-emerald-600', error:'bg-red-600', info:'bg-indigo-600' }
  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[200]">
      {toasts.map(t => (
        <div key={t.id} className={`${colors[t.type]??colors.info} text-white text-sm px-4 py-3 rounded-xl shadow-xl flex items-center gap-2`}>
          <IcCheck c="w-4 h-4"/> {t.msg}
        </div>
      ))}
    </div>
  )
}

// ── Helpers de mapeamento DB ↔ UI ─────────────────────────────────
const mapRow = row => ({
  id:               row.id,
  inquilino_id:     row.inquilino_id,
  tenant:           row.inquilinos?.nome   || '',
  cpf:              row.inquilinos?.cpf    || '',
  email:            row.inquilinos?.email  || '',
  phone:            row.inquilinos?.telefone || '',
  property:         row.imovel,
  value:            Number(row.valor_aluguel)     || 0,
  seguroFinanceiro: Number(row.seguro_financeiro) || 0,
  seguroIncendio:   Number(row.seguro_incendio)   || 0,
  iptu:             Number(row.iptu)              || 0,
  dueDay:           row.dia_vencimento,
  start:            row.data_inicio,
  end:              row.data_fim,
  status:           row.status,
  totalValue:       (Number(row.valor_aluguel)||0) + (Number(row.seguro_financeiro)||0) +
                    (Number(row.seguro_incendio)||0) + (Number(row.iptu)||0),
})

// ── Página principal ───────────────────────────────────────────────
export default function Contratos() {
  const { user }  = useAuth()
  const [contracts, setContracts] = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState('Todos')
  const [page, setPage]           = useState(1)
  const [selected, setSelected]   = useState(null)
  const [editing, setEditing]     = useState(null)
  const [adding, setAdding]       = useState(false)
  const [scanning, setScanning]   = useState(null)
  const [toDelete, setToDelete]   = useState(null)
  const [showBatch, setShowBatch] = useState(false)
  const [isRenewal, setIsRenewal] = useState(false)
  const { toasts, toast }         = useToast()

  // ── Carregar contratos ─────────────────────────────────────────
  const load = async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('contratos')
      .select('*, inquilinos(nome, cpf, email, telefone)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) { toast('Erro ao carregar contratos', 'error') }
    else setContracts((data || []).map(mapRow))
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  // ── Criar contrato ─────────────────────────────────────────────
  const handleAdd = async (data) => {
    setSaving(true)
    try {
      // 1. Upsert inquilino
      let inquilino_id = null
      if (data.cpf) {
        const { data: existing } = await supabase
          .from('inquilinos').select('id').eq('user_id', user.id).eq('cpf', data.cpf).maybeSingle()
        if (existing) {
          inquilino_id = existing.id
          await supabase.from('inquilinos').update({ nome: data.tenant, email: data.email, telefone: data.phone }).eq('id', existing.id)
        }
      }
      if (!inquilino_id) {
        const { data: inq, error: errInq } = await supabase
          .from('inquilinos').insert({ user_id: user.id, nome: data.tenant, cpf: data.cpf || null, email: data.email || null, telefone: data.phone || null }).select().single()
        if (errInq) throw errInq
        inquilino_id = inq.id
      }
      // 2. Criar contrato
      const { error } = await supabase.from('contratos').insert({
        user_id: user.id, inquilino_id,
        imovel:            data.property,
        valor_aluguel:     data.value,
        seguro_financeiro: data.seguroFinanceiro,
        seguro_incendio:   data.seguroIncendio,
        iptu:              data.iptu,
        dia_vencimento:    data.dueDay,
        data_inicio:       data.start || null,
        data_fim:          data.end   || null,
        status:            data.status,
      })
      if (error) throw error
      setAdding(false)
      toast(`Contrato de ${data.tenant} adicionado!`, 'success')
      load()
    } catch (err) {
      toast(err.message || 'Erro ao criar contrato', 'error')
    } finally { setSaving(false) }
  }

  // ── Editar contrato ────────────────────────────────────────────
  const handleSave = async (data) => {
    setSaving(true)
    try {
      if (data.inquilino_id) {
        await supabase.from('inquilinos').update({
          nome: data.tenant, cpf: data.cpf || null, email: data.email || null, telefone: data.phone || null,
        }).eq('id', data.inquilino_id)
      }
      const { error } = await supabase.from('contratos').update({
        imovel:            data.property,
        valor_aluguel:     data.value,
        seguro_financeiro: data.seguroFinanceiro,
        seguro_incendio:   data.seguroIncendio,
        iptu:              data.iptu,
        dia_vencimento:    data.dueDay,
        data_inicio:       data.start || null,
        data_fim:          data.end   || null,
        status:            data.status,
      }).eq('id', data.id)
      if (error) throw error
      setEditing(null)
      setIsRenewal(false)
      toast(`Contrato de ${data.tenant} atualizado!`, 'success')
      load()
    } catch (err) {
      toast(err.message || 'Erro ao atualizar contrato', 'error')
    } finally { setSaving(false) }
  }

  // ── Excluir contrato ───────────────────────────────────────────
  const handleDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    const { error } = await supabase.from('contratos').delete().eq('id', toDelete.id)
    if (error) { toast('Erro ao excluir contrato', 'error') }
    else { toast(`Contrato de ${toDelete.tenant} excluído`, 'info'); load() }
    setToDelete(null)
    setDeleting(false)
  }

  // ── Filtros e paginação ────────────────────────────────────────
  const isPorVencer = filter === 'Por Vencer'

  const filtered = useMemo(() => contracts.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.tenant.toLowerCase().includes(q) ||
      c.property.toLowerCase().includes(q) || (c.cpf || '').includes(q)
    if (isPorVencer) return isExpiringSoon(c) && matchSearch
    const matchStatus = filter === 'Todos' || c.status === filter
    return matchStatus && matchSearch
  }), [contracts, search, filter, isPorVencer])

  const total = filtered.length
  const pages = Math.ceil(total / PER_PAGE) || 1
  const slice = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE)

  const handleFilter = f => { setFilter(f); setPage(1) }
  const handleSearch = e => { setSearch(e.target.value); setPage(1) }

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Contratos</h1>
          <p className="text-sm text-slate-500">
            {loading ? 'Carregando…' : `${total} contrato${total!==1?'s':''} encontrado${total!==1?'s':''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBatch(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors">
            <IcSend c="w-4 h-4"/> Gerar e Enviar Tudo
          </button>
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-colors">
            <IcPlus c="w-4 h-4"/> Novo Contrato
          </button>
        </div>
      </div>

      {/* Busca + Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <IcSearch c="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
          <input value={search} onChange={handleSearch}
            placeholder="Buscar por inquilino, imóvel ou CPF…"
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"/>
        </div>
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1">
          {FILTERS.map(f => (
            <button key={f} onClick={() => handleFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter===f?'bg-indigo-600 text-white shadow-sm':'text-slate-500 hover:text-slate-800'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Banner "Por Vencer" */}
      {isPorVencer && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 text-sm text-amber-800">
          <span className="text-amber-500 text-base mt-0.5">⏰</span>
          <div>
            <p className="font-semibold">Contratos vencendo nos próximos 60 dias</p>
            <p className="text-amber-700 text-xs mt-0.5">Clique em um contrato para renovar a data de término e negociar os valores.</p>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin mr-3"/>
            Carregando contratos…
          </div>
        ) : slice.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-400 text-sm mb-1">Nenhum contrato encontrado</p>
            {filter === 'Todos' && !search && (
              <button onClick={() => setAdding(true)}
                className="mt-3 text-indigo-600 text-sm font-semibold hover:underline">
                + Adicionar primeiro contrato
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Inquilino</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Imóvel</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">
                  {isPorVencer ? 'Término' : 'Venc.'}
                </th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {isPorVencer ? 'Dias Restantes' : 'Status'}
                </th>
                <th className="px-5 py-3"/>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {slice.map(c => {
                const daysLeft = isPorVencer ? Math.ceil((new Date(c.end) - new Date()) / 86400000) : null
                const urgency  = daysLeft !== null && daysLeft <= 15
                return (
                  <tr key={c.id} className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                    onClick={() => { if (isPorVencer) { setEditing(c); setIsRenewal(true) } else { setSelected(c) } }}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isPorVencer ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                          {c.tenant[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{c.tenant}</p>
                          <p className="text-xs text-slate-400">{c.cpf || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 hidden md:table-cell max-w-xs truncate">{c.property}</td>
                    <td className="px-5 py-3.5 text-slate-500 hidden lg:table-cell">
                      {isPorVencer ? fmtDate(c.end) : `Dia ${c.dueDay}`}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-700">{fmt(c.totalValue)}</td>
                    <td className="px-5 py-3.5 text-center">
                      {isPorVencer ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${urgency ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {urgency ? '🔴' : '⚠️'} {daysLeft}d
                        </span>
                      ) : (
                        <Badge status={c.status}/>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-300 text-right">
                      {isPorVencer
                        ? <span className="text-xs text-amber-500 font-semibold">Renovar</span>
                        : <IcChevR c="w-4 h-4"/>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {!loading && pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500">{(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE,total)} de {total}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-30 hover:bg-slate-100 transition-colors">
                <IcChevL c="w-4 h-4"/>
              </button>
              <button onClick={() => setPage(p=>Math.min(pages,p+1))} disabled={page===pages}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-30 hover:bg-slate-100 transition-colors">
                <IcChevR c="w-4 h-4"/>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modais */}
      {selected && !editing && !scanning && (
        <ContractDrawer contract={selected} onClose={() => setSelected(null)}
          onEdit={c => { setSelected(null); setEditing(c) }}
          onScan={c => { setSelected(null); setScanning(c) }}
          onDelete={c => { setSelected(null); setToDelete(c) }}
          onToast={toast}/>
      )}
      {editing && (
        <ContractForm
          title={isRenewal ? '🔄 Renovar Contrato' : 'Editar Contrato'}
          accentColor={isRenewal ? 'bg-amber-400' : 'bg-purple-500'}
          saving={saving}
          saveLabel={isRenewal
            ? <><IcCheck c="w-4 h-4"/> Renovar Contrato</>
            : <><IcPencil c="w-4 h-4"/> Salvar Alterações</>}
          initial={{
            ...editing,
            value:            String(editing.value),
            seguroFinanceiro: String(editing.seguroFinanceiro || 0),
            seguroIncendio:   String(editing.seguroIncendio   || 0),
            iptu:             String(editing.iptu             || 0),
            dueDay:           String(editing.dueDay),
          }}
          onClose={() => { setEditing(null); setIsRenewal(false) }}
          onSave={data => handleSave({ ...data, id: editing.id, inquilino_id: editing.inquilino_id })}/>
      )}
      {adding && (
        <ContractForm title="Novo Contrato" saving={saving}
          saveLabel={<><IcPlus c="w-4 h-4"/> Adicionar</>}
          onClose={() => setAdding(false)} onSave={handleAdd}/>
      )}
      {scanning && <ScanModal contract={scanning} onClose={() => setScanning(null)} onToast={toast}/>}
      {showBatch && <BatchModal total={contracts.length} onClose={() => setShowBatch(false)}/>}
      {toDelete && (
        <DeleteModal contract={toDelete} deleting={deleting}
          onConfirm={handleDelete} onClose={() => setToDelete(null)}/>
      )}

      <ToastArea toasts={toasts}/>
    </div>
  )
}
