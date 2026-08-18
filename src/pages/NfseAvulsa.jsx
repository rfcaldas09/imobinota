import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import JSZip from 'jszip'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Lc116Picker from '../components/Lc116Picker'
import MonthPicker from '../components/MonthPicker'
import * as XLSX from 'xlsx'
import { CST_OPTIONS, CINDOP_OPTIONS } from '../lib/reforma-tributaria'
import { getReformaByLc116, CCLASSTRIB_OPTIONS } from '../lib/lc116-reforma'
import NbsPicker from '../components/NbsPicker'

// ── Ícones inline ──────────────────────────────────────────────────
const ic = (d, cls = '') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 ${cls}`}
    dangerouslySetInnerHTML={{ __html: d }} />
)
const IcPlus    = ({ c='' }) => ic('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', c)
const IcX       = ({ c='' }) => ic('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', c)
const IcSend    = ({ c='' }) => ic('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>', c)
const IcEdit    = ({ c='' }) => ic('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', c)
const IcDoc     = ({ c='' }) => ic('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>', c)
const IcDownload= ({ c='' }) => ic('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', c)
const IcBan     = ({ c='' }) => ic('<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>', c)
const IcUpload  = ({ c='' }) => ic('<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>', c)
const IcCode    = ({ c='' }) => ic('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>', c)

// ── Helpers ────────────────────────────────────────────────────────
const digits  = v => v.replace(/\D/g, '')
const fmtBRL  = v => {
  const s = String(v || '')
  // Suporta formato BR ("36.640,00") e inglês/inteiro ("36640.00", "36640")
  const n = s.includes(',')
    ? parseFloat(s.replace(/\./g, '').replace(',', '.'))
    : parseFloat(s)
  return (isNaN(n) ? 0 : n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
const nowMonth = () => new Date().toISOString().slice(0, 7)

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

// Padrão nacional — usado quando o perfil não tiver valor configurado
const NAT_RET_DEFAULT = { pIRRF: '1,50', pCSLL: '1,00', pCOFINS: '3,00', pPIS: '0,65', pINSS: '' }

// Constrói defaults de retenção a partir dos dados do perfil.
// Se o campo do perfil for null/undefined → usa padrão nacional.
// Se for 0 → respeita (sem retenção).
const mkRetDefaults = (profile) => ({
  pIRRF:   profile?.ret_irrf   != null ? String(profile.ret_irrf).replace('.', ',')   : NAT_RET_DEFAULT.pIRRF,
  pCSLL:   profile?.ret_csll   != null ? String(profile.ret_csll).replace('.', ',')   : NAT_RET_DEFAULT.pCSLL,
  pCOFINS: profile?.ret_cofins != null ? String(profile.ret_cofins).replace('.', ',') : NAT_RET_DEFAULT.pCOFINS,
  pPIS:    profile?.ret_pis    != null ? String(profile.ret_pis).replace('.', ',')    : NAT_RET_DEFAULT.pPIS,
  pINSS:   profile?.ret_inss   != null ? String(profile.ret_inss).replace('.', ',')   : NAT_RET_DEFAULT.pINSS,
})

const mkBlankForm = (retDefaults = NAT_RET_DEFAULT, reformaDefaults = {}, nfseDefaults = {}) => ({
  nome: '', cpfCnpj: '', email: '',
  valor: '', discriminacao: '', mesRef: nowMonth(), codLc116: '',
  // Endereço do tomador (obrigatório quando ISS é retido)
  tomaLogradouro: '', tomaNumero: '', tamaBairro: '', tamaCep: '', tamaCodMun: '', tamaMunNome: '',
  // Retenções — federais pré-preenchidas com defaults do perfil (ou padrão nacional)
  issRetido: false,
  ...retDefaults,
  // NFS-e por nota: município emissor e IM do prestador (pré-preenchidos com valores do perfil)
  prestMunicipioIbge:      nfseDefaults.municipioIbge      || '',
  prestInscricaoMunicipal: nfseDefaults.inscricaoMunicipal || '',
  // Reforma Tributária (IBS/CBS) — informativos, pré-preenchidos com defaults do perfil
  nbs:        reformaDefaults.nbs        || '',
  cst:        reformaDefaults.cst        || '',
  cindop:     reformaDefaults.cindop     || '',
  cclasstrib: reformaDefaults.cclasstrib || '',
})

const maskPct = v => {
  const cleaned = v.replace(/[^\d,]/g, '').replace(/,+/g, ',')
  const [int, dec] = cleaned.split(',')
  if (dec !== undefined) return `${(int || '').slice(0, 3)},${dec.slice(0, 2)}`
  return (int || '').slice(0, 3)
}

const parsePct = v => parseFloat((v || '').replace(',', '.')) || 0

// Remove pontos de milhar e converte vírgula decimal → número
// Suporta formato BR ("36.640,00") e formato inglês/inteiro ("36640.00" ou "36640")
const parseBRL = v => {
  const s = String(v || '').trim()
  if (!s) return 0
  // Formato BR: tem vírgula como separador decimal → remove pontos de milhar, converte vírgula
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  // Formato inglês ou inteiro: sem vírgula → parseFloat direto (ponto é decimal, não milhar)
  return parseFloat(s) || 0
}

// Mask BRL: converte dígitos puros em "36.640,00"
const maskBRL = raw => {
  const d = raw.replace(/\D/g, '').replace(/^0+/, '') || '0'
  const cents = d.padStart(3, '0')
  const reais = cents.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${reais},${cents.slice(-2)}`
}

const calcRet  = (valor, pct) => {
  const v = parseBRL(valor)
  return v > 0 && pct > 0 ? (v * pct / 100) : 0
}
const fmtPct   = v => v > 0 ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'

// ── Status badge ───────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    emitida:   'bg-emerald-50 text-emerald-700',
    erro:      'bg-red-50 text-red-600',
    pendente:  'bg-amber-50 text-amber-700',
    cancelada: 'bg-slate-100 text-slate-500',
  }
  const labels = { emitida: 'Emitida', erro: 'Erro', pendente: 'Pendente', cancelada: 'Cancelada' }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg[status] || 'bg-slate-100 text-slate-500'}`}>
      {labels[status] || status}
    </span>
  )
}

// 48h em ms — mesma janela do backend
const PRAZO_CANCEL_MS = 48 * 60 * 60 * 1000

// ── Modal: adicionar/editar tomador ────────────────────────────────
function TomadorModal({ initial, onSave, onClose, retDefaults, issAliquota = 0, reformaDefaults = {}, nfseDefaults = {} }) {
  const [f, setF]       = useState(initial || mkBlankForm(retDefaults, reformaDefaults, nfseDefaults))
  const set = k => e   => setF(p => ({ ...p, [k]: e.target.value }))
  const setPct = k => e => setF(p => ({ ...p, [k]: maskPct(e.target.value) }))
  const [err, setErr]         = useState('')
  const [warnedNoCpf, setWarnedNoCpf] = useState(false)

  const valorNum = parseBRL(f.valor)

  // Calcula retenções em tempo real conforme valor digitado
  const retIRRF   = calcRet(f.valor, parsePct(f.pIRRF))
  const retCSLL   = calcRet(f.valor, parsePct(f.pCSLL))
  const retCOFINS = calcRet(f.valor, parsePct(f.pCOFINS))
  const retPIS    = calcRet(f.valor, parsePct(f.pPIS))
  const retINSS   = calcRet(f.valor, parsePct(f.pINSS))
  const totalRet  = retIRRF + retCSLL + retCOFINS + retPIS + retINSS
  const liquido   = valorNum - totalRet

  const [cepLoading, setCepLoading] = useState(false)
  const buscarCep = async cep => {
    const c = digits(cep)
    if (c.length !== 8) return
    setCepLoading(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`)
      const d = await r.json()
      if (!d.erro) {
        setF(p => ({
          ...p,
          tomaLogradouro: d.logradouro || p.tomaLogradouro,
          tamaBairro:     d.bairro     || p.tamaBairro,
          tamaCodMun:     d.ibge       || p.tamaCodMun,
          tamaMunNome:    d.localidade || p.tamaMunNome,
        }))
      }
    } catch { /* silencia */ } finally { setCepLoading(false) }
  }

  const handleSave = () => {
    if (!f.nome.trim())        { setErr('Informe o nome do tomador.'); return }
    const v = parseBRL(f.valor)
    if (!v || v <= 0)          { setErr('Informe o valor do serviço.'); return }
    if (!f.mesRef)             { setErr('Informe a competência.'); return }
    if (f.issRetido && !f.cpfCnpj.trim()) {
      setErr('CPF/CNPJ do tomador é obrigatório quando o ISS é retido pelo tomador.')
      return
    }
    if (f.issRetido && (!f.tamaCep.trim() || !f.tamaCodMun.trim() || !f.tomaLogradouro.trim() || !f.tamaBairro.trim())) {
      setErr('Endereço do tomador (CEP, logradouro, bairro) é obrigatório quando o ISS é retido.')
      return
    }
    // Aviso (não bloqueante) se CPF/CNPJ não preenchido: o tomador ficará sem identificação na nota
    if (!f.cpfCnpj.trim() && !warnedNoCpf) {
      setWarnedNoCpf(true)
      setErr('⚠️ Sem CPF/CNPJ o tomador não será identificado na nota fiscal. Clique em Adicionar novamente para confirmar assim mesmo.')
      return
    }
    setErr('')
    setWarnedNoCpf(false)
    // Salva como string mascarada BR ("36.640,00") para que parseBRL a leia corretamente depois
    onSave({ ...f, valor: maskBRL(String(Math.round(v * 100))) })
  }

  const TAX_FIELDS = [
    { key: 'pIRRF',   label: 'IRRF',   ret: retIRRF,   hint: 'Imposto de Renda Retido na Fonte' },
    { key: 'pCSLL',   label: 'CSLL',   ret: retCSLL,   hint: 'Contribuição Social sobre o Lucro Líquido' },
    { key: 'pCOFINS', label: 'COFINS', ret: retCOFINS, hint: 'Contribuição para o Financiamento da Seguridade Social' },
    { key: 'pPIS',    label: 'PIS',    ret: retPIS,    hint: 'Programa de Integração Social' },
    { key: 'pINSS',   label: 'INSS',   ret: retINSS,   hint: 'Previdência Social' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Tomador da NFS-e</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcX c="w-5 h-5"/></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* ── Dados do tomador ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-500 block mb-1">Nome / Razão Social *</label>
              <input value={f.nome} onChange={set('nome')} placeholder="Nome completo ou razão social"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">
                CPF / CNPJ {f.issRetido ? <span className="text-red-500">*</span> : <span className="font-normal text-slate-400">(opcional)</span>}
              </label>
              <input value={f.cpfCnpj}
                onChange={e => { setF(p => ({ ...p, cpfCnpj: maskCpfCnpj(e.target.value) })); setWarnedNoCpf(false); setErr('') }}
                placeholder={f.issRetido ? 'Obrigatório quando ISS é retido' : 'Recomendado — aparece na nota fiscal'}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono ${f.issRetido && !f.cpfCnpj ? 'border-orange-300' : 'border-slate-200'}`}/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Competência *</label>
              <input type="month" value={f.mesRef} onChange={set('mesRef')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
            </div>

            {/* Endereço do tomador — obrigatório quando ISS é retido, opcional quando identificado */}
            {(f.issRetido || f.cpfCnpj.trim()) && (
              <div className={`col-span-2 border rounded-xl p-3 space-y-2 ${f.issRetido ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-slate-50'}`}>
                <p className={`text-xs font-semibold ${f.issRetido ? 'text-orange-700' : 'text-slate-600'}`}>
                  Endereço do tomador {f.issRetido ? <><span className="text-red-500">*</span> — exigido quando ISS é retido</> : '(opcional)'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">CEP *</label>
                    <div className="relative">
                      <input value={f.tamaCep}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g,'').slice(0,8)
                          setF(p => ({ ...p, tamaCep: v }))
                          if (v.length === 8) buscarCep(v)
                        }}
                        placeholder="00000000" maxLength={8}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono pr-8"/>
                      {cepLoading && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">…</span>}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Município (código IBGE)</label>
                    <input value={f.tamaMunNome ? `${f.tamaMunNome} (${f.tamaCodMun})` : f.tamaCodMun}
                      readOnly placeholder="Preenchido pelo CEP"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500 font-mono text-xs"/>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-slate-500 block mb-1">Logradouro *</label>
                    <input value={f.tomaLogradouro} onChange={set('tomaLogradouro')} placeholder="Rua, Avenida..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Número</label>
                    <input value={f.tomaNumero} onChange={set('tomaNumero')} placeholder="S/N"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Bairro *</label>
                    <input value={f.tamaBairro} onChange={set('tamaBairro')} placeholder="Bairro"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
                  </div>
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">E-mail (para envio do PDF)</label>
              <input type="email" value={f.email} onChange={set('email')} placeholder="cliente@email.com"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Valor do serviço (R$) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">R$</span>
                <input
                  value={f.valor}
                  onChange={e => {
                    // Extrai só dígitos do valor atual do input (evita acúmulo de dígitos
                    // ao editar um campo já mascarado como "36.640,00")
                    const raw = e.target.value.replace(/\D/g, '').slice(0, 9)
                    setF(p => ({ ...p, valor: maskBRL(raw) }))
                  }}
                  onFocus={e => e.target.select()}
                  placeholder="0,00"
                  inputMode="numeric"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono text-right"/>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-500 block mb-1">Discriminação do serviço</label>
              <textarea value={f.discriminacao} onChange={set('discriminacao')}
                placeholder="Descreva o serviço prestado (aparece na nota fiscal)."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"/>
            </div>
            <div className="col-span-2">
              <Lc116Picker
                value={f.codLc116}
                onChange={v => {
                  const r = getReformaByLc116(v)
                  setF(p => ({
                    ...p,
                    codLc116: v,
                    ...(r ? { nbs: r.nbs, cindop: r.indop, cclasstrib: r.cclasstrib } : {}),
                  }))
                }}
                label="Código LC 116 (opcional)"
              />
            </div>
          </div>

          {/* ── Retenções ── sempre visível ── */}
          <div className="border border-slate-200 rounded-xl px-4 py-4 space-y-4">
            <p className="text-sm font-semibold text-slate-700">Retenções de Impostos</p>

            {/* ISS */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={f.issRetido}
                onChange={e => setF(p => ({ ...p, issRetido: e.target.checked }))}
                className="mt-0.5 accent-indigo-600"/>
              <div>
                <p className="text-sm font-medium text-slate-700">ISS retido pelo tomador</p>
                <p className="text-xs text-slate-400 mt-0.5">O tomador desconta e recolhe o ISS diretamente à prefeitura</p>
              </div>
            </label>

            {/* Federais */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Retenções Federais</p>
              <div className="space-y-2">
                {TAX_FIELDS.map(({ key, label, ret, hint }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-16 text-xs font-semibold text-slate-600 shrink-0">{label}</span>
                    <div className="relative flex-shrink-0">
                      <input
                        value={f[key]}
                        onChange={setPct(key)}
                        placeholder="0,00"
                        className="w-20 px-2 py-1.5 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono pr-6"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                    </div>
                    <span className="text-xs text-slate-400 flex-1 truncate" title={hint}>{hint}</span>
                    {ret > 0 && (
                      <span className="text-xs font-semibold text-red-600 shrink-0 min-w-[72px] text-right">
                        − {fmtBRL(ret)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Resumo */}
            {valorNum > 0 && (
              <div className="bg-slate-50 rounded-lg px-3 py-2.5 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Valor bruto</span>
                  <span className="font-semibold">{fmtBRL(valorNum)}</span>
                </div>
                {totalRet > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Total de retenções federais</span>
                    <span className="font-semibold">− {fmtBRL(totalRet)}</span>
                  </div>
                )}
                {f.issRetido ? (
                  <div className="flex justify-between text-orange-600">
                    <span>ISS retido pelo tomador</span>
                    <span className="font-semibold">− {fmtBRL(valorNum * (issAliquota / 100))}</span>
                  </div>
                ) : issAliquota > 0 && valorNum > 0 ? (
                  <div className="flex justify-between text-blue-600">
                    <span>ISS próprio ({String(issAliquota).replace('.', ',')}%) — recolhido pelo prestador</span>
                    <span className="font-semibold">{fmtBRL(valorNum * (issAliquota / 100))}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1 mt-1">
                  <span>Valor líquido estimado</span>
                  <span>{fmtBRL(liquido)}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Município emissor e IM do prestador (por nota) ── */}
          <div className="border border-indigo-200 bg-indigo-50 rounded-xl px-4 py-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-indigo-700">🏙️ Município e Inscrição Municipal do Prestador</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Código IBGE (7 dígitos)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={7}
                  value={f.prestMunicipioIbge}
                  onChange={e => setF(p => ({ ...p, prestMunicipioIbge: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
                  placeholder="ex: 8105005"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Inscrição Municipal (IM)</label>
                <input
                  type="text"
                  value={f.prestInscricaoMunicipal}
                  onChange={e => setF(p => ({ ...p, prestInscricaoMunicipal: e.target.value }))}
                  placeholder="Deixe vazio se não exigido"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                />
              </div>
            </div>
            <p className="text-[11px] text-indigo-600 leading-snug">
              Pré-preenchido com os valores do perfil. Altere por nota se o serviço for emitido em outro município.
              Deixe a IM vazia se o município não exigir (evita erro E0120).
            </p>
          </div>

          {/* ── Reforma Tributária (IBS/CBS) — informativos ── */}
          <div className="border border-violet-200 bg-violet-50 rounded-xl px-4 py-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-violet-700">🏛️ Reforma Tributária — IBS/CBS</span>
            </div>
            {/* NBS */}
            <NbsPicker value={f.nbs} onChange={v => setF(p => ({ ...p, nbs: v }))} />
            {/* CST */}
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">CST — Código de Situação Tributária</label>
              <select
                value={f.cst}
                onChange={e => setF(p => ({ ...p, cst: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
              >
                <option value="">— Selecione o CST —</option>
                {CST_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {/* cIndOp */}
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">cIndOp — Indicador de Operação</label>
              <select
                value={f.cindop}
                onChange={e => setF(p => ({ ...p, cindop: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
              >
                <option value="">— Selecione o Indicador de Operação —</option>
                {CINDOP_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {/* cClassTrib */}
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">cClassTrib — Classificação Tributária</label>
              <select
                value={f.cclasstrib}
                onChange={e => setF(p => ({ ...p, cclasstrib: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
              >
                <option value="">— Selecione a Classificação Tributária —</option>
                {CCLASSTRIB_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
        </div>

        <div className="flex gap-2 px-6 pb-6">
          <button onClick={onClose}
            className="flex-1 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleSave}
            className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Parser de planilha XLS → fila de emissão ──────────────────────
const COMP_COLS = ['Competência','Competencia','Mês de referência','Mes de referencia','Mês','Mes','mesRef']

function parseXlsRows(data, fallbackMesRef, retDefaults = NAT_RET_DEFAULT) {
  return data.map((row, i) => {
    const nome = String(
      row['Nome completo da paciente'] ?? row['Nome'] ?? row['Tomador'] ?? row['Razão Social'] ?? ''
    ).trim()

    const cpfCnpj = String(
      row['CPF da paciente'] ?? row['CPF'] ?? row['CNPJ'] ?? row['CPF/CNPJ'] ?? ''
    ).trim()

    const email = String(
      row['Email para envio da nota fiscal (se houver)'] ?? row['Email'] ?? row['E-mail'] ?? ''
    ).trim()

    // Valor — aceita número ou string em formato BR
    let valorNum = 0
    const vRaw = row['Valor (R$)'] ?? row['Valor'] ?? row['Valor R$'] ?? row['valor'] ?? ''
    if (typeof vRaw === 'number') {
      valorNum = vRaw
    } else {
      const s = String(vRaw).replace(/[R$\s]/g, '')
      valorNum = parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
    }

    // Discriminação — concatena motivo + detalhe quando for "outro"
    const motivo      = String(row['Motivo do pagamento:'] ?? row['Motivo do pagamento'] ?? row['Motivo'] ?? row['Discriminação'] ?? '').trim()
    const outroDetalhe = String(row['Se o for outro, descreva aqui'] ?? row['Detalhe'] ?? '').trim()
    let discriminacao = motivo
    if (motivo.toLowerCase() === 'outro' && outroDetalhe) {
      discriminacao = outroDetalhe
    } else if (outroDetalhe && outroDetalhe !== motivo) {
      discriminacao = [motivo, outroDetalhe].filter(Boolean).join(' - ')
    }

    // Competência — busca coluna dedicada; senão usa fallback
    const compRaw = COMP_COLS.reduce((f, c) => f || row[c] || '', '')
    let _mesRefFromSheet = null
    if (compRaw) {
      const s = String(compRaw).trim()
      if (/^\d{4}-\d{2}$/.test(s)) {
        _mesRefFromSheet = s
      } else if (/^\d{2}\/\d{4}$/.test(s)) {
        const [mm, yyyy] = s.split('/')
        _mesRefFromSheet = `${yyyy}-${mm}`
      }
    }

    return {
      _id:              i,
      _mesRefFromSheet,
      nome,
      cpfCnpj,
      email,
      valor:            valorNum > 0 ? maskBRL(String(Math.round(valorNum * 100))) : '',
      discriminacao,
      mesRef:           _mesRefFromSheet || fallbackMesRef,
      codLc116:         '',
      issRetido:        false,
      ...retDefaults,
      tomaLogradouro: '', tomaNumero: '', tamaBairro: '', tamaCep: '', tamaCodMun: '', tamaMunNome: '',
    }
  }).filter(r => r.nome && parseFloat(r.valor) > 0)
}

// ── Modal: importar de planilha XLS ───────────────────────────────
function ImportXlsModal({ onImport, onClose, retDefaults = NAT_RET_DEFAULT }) {
  const [step, setStep]           = useState('upload')
  const [defaultMes, setDefaultMes] = useState(nowMonth())
  const [rows, setRows]           = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [fileName, setFileName]   = useState('')
  const [dragOver, setDragOver]   = useState(false)
  const [parseErr, setParseErr]   = useState('')
  const fileRef = useRef(null)

  const processFile = file => {
    if (!file) return
    setParseErr('')
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!data.length) { setParseErr('Planilha vazia ou sem dados.'); return }
        const parsed = parseXlsRows(data, defaultMes, retDefaults)
        if (!parsed.length) {
          setParseErr('Nenhuma linha válida encontrada. Verifique se a planilha tem colunas "Nome" e "Valor".')
          return
        }
        setRows(parsed)
        setSelectedIds(new Set(parsed.map(r => r._id)))
        setFileName(file.name)
        setStep('preview')
      } catch (err) { setParseErr('Erro ao ler arquivo: ' + err.message) }
    }
    reader.readAsArrayBuffer(file)
  }

  const allSelected  = rows.length > 0 && selectedIds.size === rows.length
  const noneSelected = selectedIds.size === 0

  const toggleAll = () =>
    allSelected ? setSelectedIds(new Set()) : setSelectedIds(new Set(rows.map(r => r._id)))

  const toggleRow = id => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleImport = () => {
    const toImport = rows
      .filter(r => selectedIds.has(r._id))
      .map(r => ({ ...r, mesRef: r._mesRefFromSheet || defaultMes }))
    onImport(toImport)
  }

  // ── Upload step ───────────────────────────────────────────────
  if (step === 'upload') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Importar NFS-e de planilha</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcX c="w-5 h-5"/></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Mês de competência padrão */}
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Mês de competência padrão</label>
            <input type="month" value={defaultMes} onChange={e => setDefaultMes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
            <p className="text-xs text-slate-400 mt-1">Usado para linhas sem coluna "Competência" na planilha.</p>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files[0]) }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors select-none ${
              dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
            }`}>
            <IcUpload c="w-8 h-8 mx-auto mb-3 text-slate-300"/>
            <p className="text-sm font-medium text-slate-600">Arraste o arquivo aqui</p>
            <p className="text-xs text-slate-400 mt-1">ou clique para selecionar</p>
            <p className="text-xs text-slate-300 mt-2">.xlsx · .xls</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => processFile(e.target.files[0])}/>

          {parseErr && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{parseErr}</p>
          )}
        </div>

        <div className="px-6 pb-6">
          <button onClick={onClose}
            className="w-full py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )

  // ── Preview step ──────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Revisão da importação</h2>
            <p className="text-xs text-slate-400 mt-0.5">{fileName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcX c="w-5 h-5"/></button>
        </div>

        {/* Controls bar */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3 bg-slate-50">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-slate-500">Competência padrão</label>
            <input type="month" value={defaultMes} onChange={e => setDefaultMes(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"/>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleAll}
              className="text-xs font-semibold text-indigo-600 hover:underline">
              {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
            <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
              {selectedIds.size} de {rows.length} selecionadas
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="max-h-[50vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
              <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-2.5 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-indigo-600"/>
                </th>
                <th className="px-3 py-2.5 text-left">Nome</th>
                <th className="px-3 py-2.5 text-left">CPF</th>
                <th className="px-3 py-2.5 text-left">Competência</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5 text-left">Discriminação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const checked     = selectedIds.has(row._id)
                const mesDisplay  = row._mesRefFromSheet || defaultMes
                return (
                  <tr key={row._id} onClick={() => toggleRow(row._id)}
                    className={`border-t border-slate-50 cursor-pointer transition-colors ${
                      checked ? 'hover:bg-slate-50/50' : 'opacity-40 hover:opacity-60 bg-slate-50'
                    }`}>
                    <td className="px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={checked} onChange={() => toggleRow(row._id)}
                        className="accent-indigo-600"/>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-800 truncate max-w-[190px]">{row.nome}</p>
                      {row.email && <p className="text-xs text-slate-400 truncate max-w-[190px]">{row.email}</p>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{row.cpfCnpj || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {mesDisplay}
                      {row._mesRefFromSheet && (
                        <span className="ml-1 text-indigo-400 font-medium">(planilha)</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-800 whitespace-nowrap">
                      {fmtBRL(row.valor)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[160px]">
                      <span className="truncate block" title={row.discriminacao}>
                        {row.discriminacao || '—'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Nota */}
        <p className="text-xs text-slate-400 px-6 pt-4">
          💡 Retenções federais padrão (IRRF, CSLL, COFINS, PIS) serão aplicadas a todas as linhas importadas. ISS não retido.
        </p>

        {/* Footer buttons */}
        <div className="flex gap-2 px-6 py-5 border-t border-slate-100 mt-2">
          <button onClick={() => setStep('upload')}
            className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
            ← Voltar
          </button>
          <button onClick={handleImport} disabled={noneSelected}
            className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">
            Importar selecionadas ({selectedIds.size})
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Painel de progresso da emissão ─────────────────────────────────
function EmissaoProgress({ items, results, current, done }) {
  const [expanded, setExpanded] = useState(null)
  const total    = items.length
  const finished = results.length
  const pct      = total > 0 ? Math.round((finished / total) * 100) : 0

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 text-sm">
          {done ? '✅ Emissão concluída' : '⚡ Emitindo notas…'}
        </h3>
        <span className="text-xs text-slate-400">{finished}/{total}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}/>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => {
          const res        = results.find(r => r.index === i)
          const isCurrent  = current === i && !res
          const isPending  = !res && !isCurrent
          const isExpanded = expanded === i

          return (
            <div key={i}>
              <div className="flex items-center justify-between text-sm gap-2">
                <span className="text-slate-700 truncate">{item.nome}</span>
                <span className={`flex-shrink-0 font-medium ${
                  res?.ok    ? 'text-emerald-600' :
                  res?.erro  ? 'text-red-500 cursor-pointer hover:underline' :
                  isCurrent  ? 'text-amber-500' : 'text-slate-300'
                }`}
                  onClick={() => res?.erro && setExpanded(isExpanded ? null : i)}
                  title={res?.erro ? 'Clique para ver o erro completo' : undefined}
                >
                  {res?.ok      ? `✅ NFS-e ${res.numero || ''}` :
                   res?.erro    ? `❌ ${res.erro.length > 80 ? res.erro.slice(0, 80) + '…' : res.erro}` :
                   isCurrent    ? '⏳ Emitindo…' : '—'}
                </span>
              </div>
              {res?.erro && isExpanded && (
                <div className="mt-1 ml-0 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 break-all">
                  {res.erro}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────
export default function NfseAvulsa() {
  const { user } = useAuth()
  const lsKey = user ? `nfsa_pending_${user.id}` : null

  // Defaults de retenção do perfil do usuário
  const [retDefaults, setRetDefaults] = useState(NAT_RET_DEFAULT)
  const [issAliquota, setIssAliquota] = useState(0) // alíquota ISS próprio do perfil (%)
  const [reformaDefaults, setReformaDefaults] = useState({}) // NBS/CST/cIndOp/cClassTrib do perfil
  const [nfseDefaults, setNfseDefaults] = useState({}) // município e IM do prestador (defaults por nota)
  useEffect(() => {
    if (!user) return
    supabase.from('profiles')
      .select('ret_irrf, ret_csll, ret_cofins, ret_pis, ret_inss, aliquota_iss, nfse_nbs, nfse_cst, nfse_cindop, nfse_cclasstrib, nfse_municipio_ibge, inscricao_municipal')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setRetDefaults(mkRetDefaults(data))
          setIssAliquota(parseFloat(data.aliquota_iss || 0) || 0)
          setReformaDefaults({
            nbs:        data.nfse_nbs        || '',
            cst:        data.nfse_cst        || '',
            cindop:     data.nfse_cindop     || '',
            cclasstrib: data.nfse_cclasstrib || '',
          })
          setNfseDefaults({
            municipioIbge:      data.nfse_municipio_ibge   || '',
            inscricaoMunicipal: data.inscricao_municipal   || '',
          })
        }
      })
  }, [user])

  // Fila de tomadores pendentes (persiste em localStorage)
  const [pending, setPending]       = useState([])
  const [showModal, setShowModal]   = useState(false)
  const [editIdx, setEditIdx]       = useState(null)
  const [showImportModal, setShowImportModal] = useState(false)

  // Estado de emissão em lote
  const [emitting, setEmitting]       = useState(false)
  const [emitSnapshot, setEmitSnapshot] = useState([])   // cópia de `pending` no momento do disparo
  const [emitResults, setEmitResults] = useState([])
  const [emitCurrent, setEmitCurrent] = useState(null)
  const [emitDone, setEmitDone]       = useState(false)

  // Histórico de avulsas emitidas
  const [history, setHistory]         = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Filtro de período do histórico
  const [histView, setHistView] = useState('mensal')
  const [histMes,  setHistMes]  = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [histAno,  setHistAno]  = useState(() => new Date().getFullYear())

  // ── localStorage ──────────────────────────────────────────────
  useEffect(() => {
    if (!lsKey) return
    try { setPending(JSON.parse(localStorage.getItem(lsKey) || '[]')) } catch {}
  }, [lsKey])

  useEffect(() => {
    if (!lsKey) return
    localStorage.setItem(lsKey, JSON.stringify(pending))
  }, [pending, lsKey])

  // ── Histórico ────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!user) return
    setLoadingHistory(true)
    const { data } = await supabase
      .from('nfse_emissoes')
      .select('id, numero_nfse, numero_dps, tomador_nome, valor_servico, competencia, status, created_at, erro_msg, chave_acesso, cob_data_json')
      .eq('user_id', user.id)
      .is('cobranca_id', null)
      .order('created_at', { ascending: false })
      .limit(100)
    setHistory(data || [])
    setLoadingHistory(false)
  }, [user])

  useEffect(() => { loadHistory() }, [loadHistory])

  // ── Adicionar / Editar tomador ────────────────────────────────
  const handleSaveModal = item => {
    if (editIdx !== null) {
      setPending(p => p.map((x, i) => i === editIdx ? item : x))
    } else {
      setPending(p => [...p, item])
    }
    setShowModal(false)
    setEditIdx(null)
  }

  const handleRemove = idx => {
    setPending(p => p.filter((_, i) => i !== idx))
  }

  // ── Importar linhas do XLS ────────────────────────────────────
  const handleImportRows = rows => {
    setPending(p => [...p, ...rows])
    setShowImportModal(false)
  }

  const handleEdit = idx => {
    setEditIdx(idx)
    setShowModal(true)
  }

  // ── Emissão em lote ───────────────────────────────────────────
  const handleEmitirTudo = async () => {
    if (!pending.length) return
    const snapshot = [...pending]   // congela a lista no momento do clique
    setEmitSnapshot(snapshot)
    setEmitting(true)
    setEmitResults([])
    setEmitDone(false)

    const jwt = (await supabase.auth.getSession())?.data?.session?.access_token

    const delay = ms => new Promise(r => setTimeout(r, ms))

    for (let i = 0; i < snapshot.length; i++) {
      setEmitCurrent(i)
      const item = snapshot[i]
      try {
        const res = await fetch('/.netlify/functions/nfse-emitir', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({
            userId:  user.id,
            cobId:   null,
            cobData: {
              tenant:          item.nome,
              cpf:             item.cpfCnpj,
              email:           item.email   || '',
              totalValue:      parseBRL(item.valor),
              mesRef:          item.mesRef,
              discriminacao:   item.discriminacao || null,
              codServicoLc116: item.codLc116 || null,
              retencoes: {
                tpRetISSQN: item.issRetido ? 2 : 1,
                pIRRF:   parsePct(item.pIRRF)   || null,
                pCSLL:   parsePct(item.pCSLL)   || null,
                pCOFINS: parsePct(item.pCOFINS) || null,
                pPIS:    parsePct(item.pPIS)    || null,
                pINSS:   parsePct(item.pINSS)   || null,
              },
              tomadorEnd: item.tamaCep && item.tamaCodMun ? {
                logradouro: item.tomaLogradouro || '',
                numero:     item.tomaNumero     || 'S/N',
                bairro:     item.tamaBairro     || '',
                cep:        item.tamaCep        || '',
                codMun:     item.tamaCodMun     || '',
              } : null,
              // Por nota: município emissor e IM do prestador (sobrepõem o perfil se preenchidos)
              prestMunicipioIbge:      item.prestMunicipioIbge      || null,
              prestInscricaoMunicipal: item.prestInscricaoMunicipal ?? null,
            },
            homologacao: false,
          }),
        })
        const data = await res.json()
        if (res.ok && data.ok) {
          setEmitResults(p => [...p, { index: i, ok: true, numero: data.numeroNfse || data.numeroDps }])
        } else {
          setEmitResults(p => [...p, { index: i, ok: false, erro: data.error || 'Erro desconhecido' }])
        }
      } catch (e) {
        setEmitResults(p => [...p, { index: i, ok: false, erro: e.message }])
      }

      // Aguarda 2s entre notas para evitar rate limiting do SEFIN
      if (i < snapshot.length - 1) await delay(2000)
    }

    setEmitCurrent(null)
    setEmitDone(true)
    setEmitting(false)

    // Remove da fila somente os que foram emitidos com sucesso
    setEmitResults(prev => {
      const successIdx = new Set(prev.filter(r => r.ok).map(r => r.index))
      setPending(p => p.filter((_, i) => !successIdx.has(i)))
      return prev
    })

    // Aguarda 1.5s para o Supabase propagar as linhas antes de recarregar o histórico
    await delay(1500)
    loadHistory()
  }

  // ── Reprocessar / deletar nota com erro ─────────────────────
  const [reprocessingId, setReprocessingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const handleDeleteErro = async (em) => {
    if (!window.confirm(`Excluir registro de erro da nota "${em.tomador_nome}"? Esta ação não pode ser desfeita.`)) return
    setDeletingId(em.id)
    try {
      await supabase.from('nfse_emissoes').delete().eq('id', em.id)
      loadHistory()
    } catch (e) {
      alert('Erro ao excluir registro.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleReprocess = async (em) => {
    if (!em.cob_data_json) {
      alert('Dados da emissão original não disponíveis. Esta nota foi emitida antes do suporte a reprocessamento.')
      return
    }
    setReprocessingId(em.id)
    try {
      const jwt = (await supabase.auth.getSession())?.data?.session?.access_token
      const res = await fetch('/.netlify/functions/nfse-emitir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({
          userId:     user.id,
          cobId:      null,
          cobData:    em.cob_data_json,
          homologacao: false,
        }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        await new Promise(r => setTimeout(r, 1500))
        loadHistory()
      } else {
        alert(`Erro ao reprocessar: ${data.error || 'Erro desconhecido'}`)
        loadHistory()
      }
    } catch (e) {
      alert(`Erro: ${e.message}`)
    } finally {
      setReprocessingId(null)
    }
  }

  // ── Download PDF ─────────────────────────────────────────────
  const [downloadingId, setDownloadingId] = useState(null)

  // ── Download ZIP (todos PDF + XML do período) ─────────────────
  const [zipLoading, setZipLoading] = useState(false)
  const [zipProgress, setZipProgress] = useState({ done: 0, total: 0 })

  const downloadZipMes = async () => {
    const emitidas = filteredHistory.filter(em => em.status === 'emitida')
    if (!emitidas.length) { alert('Nenhuma NFS-e emitida neste período.'); return }

    setZipLoading(true)
    setZipProgress({ done: 0, total: emitidas.length * 2 })

    const zip = new JSZip()
    const pdfFolder = zip.folder('PDF')
    const xmlFolder = zip.folder('XML')
    let done = 0

    const jwt = (await supabase.auth.getSession())?.data?.session?.access_token
    const headers = { 'Content-Type': 'application/json', ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}) }

    for (const em of emitidas) {
      // PDF
      try {
        const res  = await fetch('/.netlify/functions/nfse-pdf', { method: 'POST', headers, body: JSON.stringify({ userId: user.id, emissaoId: em.id }) })
        const data = await res.json()
        if (res.ok && data.pdfBase64) {
          const bytes = Uint8Array.from(atob(data.pdfBase64), c => c.charCodeAt(0))
          pdfFolder.file(data.filename || `NFS-e_${em.numero_nfse || em.id}.pdf`, bytes)
        }
      } catch { /* ignora falha individual */ }
      done++; setZipProgress({ done, total: emitidas.length * 2 })

      // XML
      try {
        const res  = await fetch('/.netlify/functions/nfse-xml', { method: 'POST', headers, body: JSON.stringify({ userId: user.id, emissaoId: em.id }) })
        const data = await res.json()
        if (res.ok && data.xmlBase64) {
          const bytes = Uint8Array.from(atob(data.xmlBase64), c => c.charCodeAt(0))
          xmlFolder.file(data.filename || `NFS-e_${em.numero_nfse || em.id}.xml`, bytes)
        }
      } catch { /* ignora falha individual */ }
      done++; setZipProgress({ done, total: emitidas.length * 2 })
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    const label = histView === 'mensal'
      ? `${histMes.getFullYear()}_${String(histMes.getMonth() + 1).padStart(2, '0')}`
      : String(histAno)
    a.download = `NFS-e_Avulsa_${label}.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    setZipLoading(false)
  }

  // ── Cancelamento de NFS-e ─────────────────────────────────────
  const [cancelConfirmId, setCancelConfirmId] = useState(null) // id da emissão aguardando confirmação
  const [cancellingId,    setCancellingId]    = useState(null) // id em processo de cancelamento

  const handleCancelar = async (em) => {
    if (cancelConfirmId !== em.id) {
      // Primeiro clique → pede confirmação
      setCancelConfirmId(em.id)
      return
    }
    // Segundo clique → confirma e cancela
    setCancelConfirmId(null)
    setCancellingId(em.id)
    try {
      const jwt = (await supabase.auth.getSession())?.data?.session?.access_token
      const res = await fetch('/.netlify/functions/nfse-cancelar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({ userId: user.id, emissaoId: em.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao cancelar')
      await loadHistory()
    } catch (e) {
      alert(`Erro ao cancelar NFS-e: ${e.message}`)
    } finally {
      setCancellingId(null)
    }
  }

  const handleDownloadPdf = async (emissaoId, tomadorNome) => {
    setDownloadingId(emissaoId)
    try {
      const jwt = (await supabase.auth.getSession())?.data?.session?.access_token
      const res = await fetch('/.netlify/functions/nfse-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({ userId: user.id, emissaoId }),
      })
      const data = await res.json()
      if (!res.ok || !data.pdfBase64) throw new Error(data.error || 'Erro ao gerar PDF')
      const link = document.createElement('a')
      link.href = `data:application/pdf;base64,${data.pdfBase64}`
      link.download = data.filename || `nfse-${tomadorNome || emissaoId}.pdf`
      link.click()
    } catch (e) {
      alert(`Erro ao baixar PDF: ${e.message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDownloadXml = async (emissaoId, tomadorNome) => {
    setDownloadingId(`xml-${emissaoId}`)
    try {
      const jwt = (await supabase.auth.getSession())?.data?.session?.access_token
      const res = await fetch('/.netlify/functions/nfse-xml', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({ userId: user.id, emissaoId }),
      })
      const data = await res.json()
      if (!res.ok || !data.xmlBase64) throw new Error(data.error || 'XML não disponível')
      const bytes = Uint8Array.from(atob(data.xmlBase64), c => c.charCodeAt(0))
      const blob  = new Blob([bytes], { type: 'application/xml' })
      const link  = document.createElement('a')
      link.href   = URL.createObjectURL(blob)
      link.download = data.filename || `nfse-${tomadorNome || emissaoId}.xml`
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 5000)
    } catch (e) {
      alert(`Erro ao baixar XML: ${e.message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  // ── KPIs do histórico por período ────────────────────────────
  const filteredHistory = useMemo(() => {
    if (histView === 'mensal') {
      const comp = `${histMes.getFullYear()}-${String(histMes.getMonth()+1).padStart(2,'0')}`
      return history.filter(em => em.competencia === comp)
    } else {
      return history.filter(em => em.competencia?.startsWith(String(histAno)))
    }
  }, [history, histView, histMes, histAno])

  const histEmitidas = useMemo(() => filteredHistory.filter(em => em.status === 'emitida'), [filteredHistory])
  const histTotalVal = useMemo(() => histEmitidas.reduce((s, em) => s + Number(em.valor_servico || 0), 0), [histEmitidas])
  const histErros    = useMemo(() => filteredHistory.filter(em => em.status === 'erro').length, [filteredHistory])

  // ── Render ────────────────────────────────────────────────────
  const successCount = emitResults.filter(r => r.ok).length
  const errorCount   = emitResults.filter(r => !r.ok).length

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* ── 1. Header da página ───────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">NFS-e Avulsa</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Emita notas fiscais sem vínculo com contratos. Ideal para atendimentos avulsos.
        </p>
      </div>

      {/* ── 2. KPI Cards + toggle de período ─────────────────── */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              {['mensal','anual'].map(v => (
                <button key={v} onClick={() => setHistView(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${histView === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {v === 'mensal' ? '📅 Mensal' : '📊 Anual'}
                </button>
              ))}
            </div>
            {histView === 'mensal' ? (
              <MonthPicker value={histMes} onChange={setHistMes}/>
            ) : (
              <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 overflow-hidden select-none">
                <button onClick={() => setHistAno(a => a - 1)}
                  className="px-3 py-2.5 text-slate-500 hover:bg-slate-200 font-bold text-base leading-none">‹</button>
                <span className="px-4 font-semibold text-slate-800 text-sm">{histAno}</span>
                <button onClick={() => setHistAno(a => a + 1)}
                  className="px-3 py-2.5 text-slate-500 hover:bg-slate-200 font-bold text-base leading-none">›</button>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-5 text-white">
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide mb-1">Total Emitido</p>
            <p className="text-2xl font-bold mb-0.5">{fmtBRL(histTotalVal)}</p>
            <p className="text-indigo-200 text-xs">
              {histEmitidas.length} nota{histEmitidas.length !== 1 ? 's' : ''} emitida{histEmitidas.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">✅ Emitidas</p>
            <p className="text-2xl font-bold text-emerald-600">{histEmitidas.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmtBRL(histTotalVal)}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">❌ Com Erro</p>
            <p className="text-2xl font-bold text-red-500">{histErros}</p>
            <p className="text-xs text-slate-400 mt-0.5">{histErros > 0 ? 'Verifique o histórico' : 'Nenhum erro'}</p>
          </div>
        </div>
      </div>

      {/* ── 3. Fila de emissão ────────────────────────────────── */}
      <div>
        {/* Progress durante emissão */}
        {(emitting || emitDone) && emitSnapshot.length > 0 && (
          <EmissaoProgress
            items={emitSnapshot}
            results={emitResults}
            current={emitCurrent}
            done={emitDone}
          />
        )}

        {/* Resumo pós-emissão */}
        {emitDone && (
          <div className={`rounded-xl px-4 py-3 mb-4 text-sm font-medium ${
            errorCount === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}>
            {successCount > 0 && `✅ ${successCount} NFS-e(s) emitida(s) com sucesso. `}
            {errorCount   > 0 && `⚠️ ${errorCount} com erro — verifique abaixo e tente novamente.`}
          </div>
        )}

        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <IcDoc c="text-indigo-500"/>
              <span className="text-sm font-semibold text-slate-700">Fila de emissão</span>
              {pending.length > 0 && (
                <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  {pending.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {pending.length > 0 && !emitting && (
                <button onClick={handleEmitirTudo}
                  className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700">
                  <IcSend c="w-3.5 h-3.5"/> Gerar e Enviar Tudo ({pending.length})
                </button>
              )}
              <button
                onClick={() => setShowImportModal(true)}
                disabled={emitting}
                className="flex items-center gap-1.5 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-50 disabled:opacity-50">
                <IcUpload c="w-3.5 h-3.5"/> Importar de XLS
              </button>
              <button
                onClick={() => { setEditIdx(null); setShowModal(true) }}
                disabled={emitting}
                className="flex items-center gap-1.5 border border-indigo-200 text-indigo-600 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-50 disabled:opacity-50">
                <IcPlus/> Adicionar Tomador
              </button>
            </div>
          </div>

          {pending.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <IcDoc c="w-10 h-10 mx-auto mb-3 opacity-30"/>
              <p className="text-sm">Nenhum tomador na fila.</p>
              <p className="text-xs mt-1">Clique em "Adicionar Tomador" para começar.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-50">
                  <th className="px-5 py-2.5 text-left">Nome / Razão Social</th>
                  <th className="px-4 py-2.5 text-left">CPF / CNPJ</th>
                  <th className="px-4 py-2.5 text-left">Competência</th>
                  <th className="px-4 py-2.5 text-right">Valor</th>
                  <th className="px-4 py-2.5"/>
                </tr>
              </thead>
              <tbody>
                {pending.map((item, i) => (
                  <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{item.nome}</p>
                      {item.email && <p className="text-xs text-slate-400">{item.email}</p>}
                      {(item.issRetido || item.pIRRF || item.pCSLL || item.pCOFINS) && (
                        <p className="text-xs text-orange-600 font-medium mt-0.5">
                          {item.issRetido ? '📌 ISS retido ' : ''}{item.pIRRF || item.pCSLL || item.pCOFINS ? '· ret. federais' : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.cpfCnpj}</td>
                    <td className="px-4 py-3 text-slate-600">{item.mesRef}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmtBRL(item.valor)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleEdit(i)} disabled={emitting}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30">
                          <IcEdit/>
                        </button>
                        <button onClick={() => handleRemove(i)} disabled={emitting}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30">
                          <IcX/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── 4. Histórico ─────────────────────────────────────── */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Histórico de emissões avulsas</span>
            {loadingHistory && (
              <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"/>
            )}
          </div>
          {filteredHistory.some(em => em.status === 'emitida') && (
            <button
              onClick={downloadZipMes}
              disabled={zipLoading}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl font-semibold text-sm hover:bg-slate-50 shadow-sm whitespace-nowrap disabled:opacity-60 disabled:cursor-wait">
              {zipLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin"/>
                  Gerando ZIP… {zipProgress.done}/{zipProgress.total}
                </>
              ) : (
                <>
                  <IcDownload c="w-4 h-4"/>
                  Baixar todos PDF e XML ({filteredHistory.filter(em => em.status === 'emitida').length} notas)
                </>
              )}
            </button>
          )}
        </div>
        {filteredHistory.length === 0 && !loadingHistory ? (
          <p className="text-center text-sm text-slate-400 py-10">Nenhuma emissão neste período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-50">
                <th className="px-5 py-2.5 text-left">Tomador</th>
                <th className="px-4 py-2.5 text-left">Competência</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-left w-40">NFS-e</th>
                <th className="px-4 py-2.5 text-left">Data</th>
                <th className="px-2 py-2.5"/>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map(em => (
                <tr key={em.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-5 py-2.5 font-medium text-slate-800">{em.tomador_nome || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{em.competencia || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{fmtBRL(em.valor_servico)}</td>
                  <td className="px-4 py-2.5 text-center"><StatusBadge status={em.status}/></td>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-500 w-40 max-w-[10rem]">
                    {em.numero_nfse || em.numero_dps || '—'}
                    {em.erro_msg && (
                      <span className="block text-red-500 text-[11px] w-36 truncate" title={em.erro_msg}>
                        {em.erro_msg}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{fmtDate(em.created_at)}</td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    {em.status === 'erro' && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleReprocess(em)}
                          disabled={reprocessingId === em.id || deletingId === em.id}
                          title={em.cob_data_json ? 'Tentar emitir novamente' : 'Dados originais não disponíveis'}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors
                            ${em.cob_data_json
                              ? 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100'
                              : 'text-slate-400 border-slate-200 bg-slate-50 cursor-not-allowed opacity-50'}`}>
                          {reprocessingId === em.id
                            ? <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"/>
                            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>}
                          Reprocessar
                        </button>
                        <button
                          onClick={() => handleDeleteErro(em)}
                          disabled={deletingId === em.id || reprocessingId === em.id}
                          title="Excluir registro de erro"
                          className="flex items-center justify-center w-7 h-7 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-40">
                          {deletingId === em.id
                            ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin"/>
                            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>}
                        </button>
                      </div>
                    )}
                    {em.status === 'cancelada' && (
                      <button
                        onClick={() => handleDeleteErro(em)}
                        disabled={deletingId === em.id}
                        title="Excluir registro de nota cancelada"
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-40">
                        {deletingId === em.id
                          ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin"/>
                          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>}
                      </button>
                    )}
                    {em.status === 'emitida' && (() => {
                      const dentroDosPrazo = (new Date() - new Date(em.created_at)) < PRAZO_CANCEL_MS
                      const confirmando    = cancelConfirmId === em.id
                      const cancelando     = cancellingId    === em.id
                      return (
                        <div className="flex items-center gap-1.5">
                          {/* Botão download PDF */}
                          <button
                            onClick={() => handleDownloadPdf(em.id, em.tomador_nome)}
                            disabled={!!downloadingId || cancelando}
                            title="Baixar PDF da NFS-e"
                            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors disabled:opacity-50">
                            {downloadingId === em.id
                              ? <div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"/>
                              : <IcDownload c="w-3.5 h-3.5"/>}
                            PDF
                          </button>

                          {/* Botão download XML */}
                          <button
                            onClick={() => handleDownloadXml(em.id, em.tomador_nome)}
                            disabled={!!downloadingId || cancelando}
                            title="Baixar XML da NFS-e"
                            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors disabled:opacity-50">
                            {downloadingId === `xml-${em.id}`
                              ? <div className="w-3.5 h-3.5 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin"/>
                              : <span className="font-mono font-bold text-[11px]">&lt;/&gt;</span>}
                            XML
                          </button>

                          {/* Botão cancelar */}
                          {dentroDosPrazo ? (
                            confirmando ? (
                              /* Estado de confirmação: mostra "Confirmar?" + "Não" */
                              <span className="flex items-center gap-1 text-xs">
                                <button
                                  onClick={() => handleCancelar(em)}
                                  disabled={cancelando}
                                  className="px-2 py-0.5 rounded bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors">
                                  {cancelando ? '...' : 'Confirmar'}
                                </button>
                                <button
                                  onClick={() => setCancelConfirmId(null)}
                                  className="px-1.5 py-0.5 rounded text-slate-500 hover:bg-slate-100 transition-colors">
                                  Não
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleCancelar(em)}
                                disabled={cancelando || downloadingId === em.id}
                                title="Cancelar NFS-e (emitida com erro)"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors">
                                {cancelando
                                  ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"/>
                                  : <IcBan/>}
                              </button>
                            )
                          ) : (
                            /* Fora do prazo: ícone cinza com tooltip */
                            <span title="Prazo de cancelamento expirado (máximo 48h após emissão)"
                              className="p-1.5 cursor-not-allowed opacity-30">
                              <IcBan/>
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal — adicionar/editar tomador */}
      {showModal && (
        <TomadorModal
          initial={editIdx !== null ? pending[editIdx] : null}
          onSave={handleSaveModal}
          onClose={() => { setShowModal(false); setEditIdx(null) }}
          retDefaults={retDefaults}
          issAliquota={issAliquota}
          reformaDefaults={reformaDefaults}
          nfseDefaults={nfseDefaults}
        />
      )}

      {/* Modal — importar de XLS */}
      {showImportModal && (
        <ImportXlsModal
          onImport={handleImportRows}
          onClose={() => setShowImportModal(false)}
          retDefaults={retDefaults}
        />
      )}
    </div>
  )
}
