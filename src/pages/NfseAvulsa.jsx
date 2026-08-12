import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Lc116Picker from '../components/Lc116Picker'
import MonthPicker from '../components/MonthPicker'

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

// ── Helpers ────────────────────────────────────────────────────────
const digits  = v => v.replace(/\D/g, '')
const fmtBRL  = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

const BLANK_FORM = {
  nome: '', cpfCnpj: '', email: '',
  valor: '', discriminacao: '', mesRef: nowMonth(), codLc116: '',
  // Retenções
  issRetido: false,
  pIRRF: '', pCSLL: '', pCOFINS: '', pPIS: '', pINSS: '',
}

// Valores padrão de retenções federais (IRRF+CSLL+COFINS+PIS)
const PRESET_RET_DEFAULT = { pIRRF: '1,50', pCSLL: '1,00', pCOFINS: '3,00', pPIS: '0,65', pINSS: '' }

const maskPct = v => {
  const cleaned = v.replace(/[^\d,]/g, '').replace(/,+/g, ',')
  const [int, dec] = cleaned.split(',')
  if (dec !== undefined) return `${(int || '').slice(0, 3)},${dec.slice(0, 2)}`
  return (int || '').slice(0, 3)
}

const parsePct = v => parseFloat((v || '').replace(',', '.')) || 0
const calcRet  = (valor, pct) => {
  const v = parseFloat((valor || '').replace(',', '.')) || 0
  return v > 0 && pct > 0 ? (v * pct / 100) : 0
}
const fmtPct   = v => v > 0 ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'

// ── Status badge ───────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    emitida: 'bg-emerald-50 text-emerald-700',
    erro:    'bg-red-50 text-red-600',
    pendente:'bg-amber-50 text-amber-700',
  }
  const labels = { emitida: 'Emitida', erro: 'Erro', pendente: 'Pendente' }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg[status] || 'bg-slate-100 text-slate-500'}`}>
      {labels[status] || status}
    </span>
  )
}

// ── Modal: adicionar/editar tomador ────────────────────────────────
function TomadorModal({ initial, onSave, onClose }) {
  const [f, setF]       = useState(initial || BLANK_FORM)
  const set = k => e   => setF(p => ({ ...p, [k]: e.target.value }))
  const setPct = k => e => setF(p => ({ ...p, [k]: maskPct(e.target.value) }))
  const [err, setErr]   = useState('')
  const [showRet, setShowRet] = useState(
    !!(initial?.issRetido || initial?.pIRRF || initial?.pCSLL || initial?.pCOFINS || initial?.pPIS || initial?.pINSS)
  )

  const valorNum = parseFloat((f.valor || '').replace(',', '.')) || 0

  // Calcula retenções
  const retIRRF   = calcRet(f.valor, parsePct(f.pIRRF))
  const retCSLL   = calcRet(f.valor, parsePct(f.pCSLL))
  const retCOFINS = calcRet(f.valor, parsePct(f.pCOFINS))
  const retPIS    = calcRet(f.valor, parsePct(f.pPIS))
  const retINSS   = calcRet(f.valor, parsePct(f.pINSS))
  const retISSVal = f.issRetido ? calcRet(f.valor, 0) : 0  // ISS: só indica retenção, valor é da alíquota
  const totalRet  = retIRRF + retCSLL + retCOFINS + retPIS + retINSS
  const liquido   = valorNum - totalRet

  const hasFedRet = f.pIRRF || f.pCSLL || f.pCOFINS || f.pPIS || f.pINSS
  const toggleRet = () => {
    if (!showRet && !hasFedRet) {
      // Auto-preenche padrões ao abrir pela primeira vez
      setF(p => ({ ...p, ...PRESET_RET_DEFAULT }))
    }
    setShowRet(s => !s)
  }

  const handleSave = () => {
    if (!f.nome.trim())        { setErr('Informe o nome do tomador.'); return }
    const v = parseFloat((f.valor || '').replace(',', '.'))
    if (!v || v <= 0)          { setErr('Informe o valor do serviço.'); return }
    if (!f.mesRef)             { setErr('Informe a competência.'); return }
    setErr('')
    onSave({ ...f, valor: String(v.toFixed(2)) })
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
              <label className="text-xs font-medium text-slate-500 block mb-1">CPF / CNPJ <span className="font-normal text-slate-400">(opcional)</span></label>
              <input value={f.cpfCnpj}
                onChange={e => setF(p => ({ ...p, cpfCnpj: maskCpfCnpj(e.target.value) }))}
                placeholder="Deixe em branco para não identificar"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Competência *</label>
              <input type="month" value={f.mesRef} onChange={set('mesRef')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">E-mail (para envio do PDF)</label>
              <input type="email" value={f.email} onChange={set('email')} placeholder="cliente@email.com"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Valor do serviço (R$) *</label>
              <input value={f.valor}
                onChange={e => setF(p => ({ ...p, valor: e.target.value.replace(/[^0-9,\.]/g, '') }))}
                placeholder="0,00"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"/>
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
                onChange={v => setF(p => ({ ...p, codLc116: v }))}
                label="Código LC 116 (opcional)"
              />
            </div>
          </div>

          {/* ── Retenções ── */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={toggleRet}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">Retenções de Impostos</span>
                {(f.issRetido || totalRet > 0) && (
                  <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                    {f.issRetido ? 'ISS ' : ''}{totalRet > 0 ? `+ ${fmtBRL(totalRet)}` : ''}
                  </span>
                )}
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                className={`w-4 h-4 text-slate-400 transition-transform ${showRet ? 'rotate-180' : ''}`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {showRet && (
              <div className="px-4 py-4 space-y-4">
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
                  <div className="mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Retenções Federais</p>
                  </div>

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
                {(totalRet > 0 || f.issRetido) && valorNum > 0 && (
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
                    {f.issRetido && (
                      <div className="flex justify-between text-orange-600">
                        <span>ISS retido pelo tomador</span>
                        <span className="font-semibold">retido na fonte</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1 mt-1">
                      <span>Valor líquido estimado</span>
                      <span>{fmtBRL(liquido)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
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

  // Fila de tomadores pendentes (persiste em localStorage)
  const [pending, setPending]     = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editIdx, setEditIdx]     = useState(null)

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
      .select('id, numero_nfse, numero_dps, tomador_nome, valor_servico, competencia, status, created_at, erro_msg, chave_acesso')
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
              totalValue:      item.valor,
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

  // ── Download PDF ─────────────────────────────────────────────
  const [downloadingId, setDownloadingId] = useState(null)

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
      // Dispara download no browser
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
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">Histórico de emissões avulsas</span>
          {loadingHistory && (
            <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"/>
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
                <th className="px-4 py-2.5 text-left">NFS-e</th>
                <th className="px-4 py-2.5 text-left">Data</th>
                <th className="px-4 py-2.5"/>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map(em => (
                <tr key={em.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-5 py-2.5 font-medium text-slate-800">{em.tomador_nome || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{em.competencia || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{fmtBRL(em.valor_servico)}</td>
                  <td className="px-4 py-2.5 text-center"><StatusBadge status={em.status}/></td>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-500">
                    {em.numero_nfse || em.numero_dps || '—'}
                    {em.erro_msg && (
                      <span className="block text-red-500 text-[11px] max-w-xs truncate" title={em.erro_msg}>
                        {em.erro_msg}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{fmtDate(em.created_at)}</td>
                  <td className="px-4 py-2.5">
                    {em.status === 'emitida' && (
                      <button
                        onClick={() => handleDownloadPdf(em.id, em.tomador_nome)}
                        disabled={downloadingId === em.id}
                        title="Baixar PDF da NFS-e"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 transition-colors">
                        {downloadingId === em.id
                          ? <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"/>
                          : <IcDownload/>}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <TomadorModal
          initial={editIdx !== null ? pending[editIdx] : null}
          onSave={handleSaveModal}
          onClose={() => { setShowModal(false); setEditIdx(null) }}
        />
      )}
    </div>
  )
}
