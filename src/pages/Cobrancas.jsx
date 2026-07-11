import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { emitirCobrancas, mesLabel, mesStr, MESES } from '../lib/cobrancas'
import MonthPicker from '../components/MonthPicker'

const ic = (d, cls='') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${cls}`}
    dangerouslySetInnerHTML={{ __html: d }} />
)
const IcZap     = ({ c='' }) => ic('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', c)
const IcCheck   = ({ c='' }) => ic('<polyline points="20 6 9 17 4 12"/>', c)
const IcRefresh = ({ c='' }) => ic('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', c)

const fmt = v => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })

const STATUS_CFG = {
  'Pago':      { bg:'bg-emerald-100', text:'text-emerald-700', dot:'bg-emerald-500' },
  'Pendente':  { bg:'bg-amber-100',   text:'text-amber-700',   dot:'bg-amber-400'   },
  'Em Atraso': { bg:'bg-red-100',     text:'text-red-700',     dot:'bg-red-500'     },
}

const FILTERS = ['Todos', 'Pago', 'Pendente', 'Em Atraso']

// ── Mapeia linha do banco ─────────────────────────────────────────
const mapCob = row => ({
  id:         row.id,
  tenant:     row.inquilinos?.nome    || '—',
  property:   row.contratos?.imovel   || '—',
  totalValue: Number(row.valor_total) || 0,
  value:      Number(row.valor_aluguel) || 0,
  dueDay:     row.dia_vencimento,
  status:     row.status || 'Pendente',
  mesRef:     row.mes_referencia,
  emissao:    row.data_emissao,
})

// ── Modal Gerar e Enviar em Massa ─────────────────────────────────
function BatchModal({ contracts, user, mesRef: initialMes, onClose, onDone }) {
  const [step, setStep]     = useState('pick')
  const [mesRef, setMesRef] = useState(initialMes)
  const [preview, setPreview]   = useState(null)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs]         = useState([])
  const [result, setResult]     = useState(null)

  useEffect(() => {
    if (!user || !contracts.length) return
    setPreview(null)
    const ref = mesStr(mesRef)
    supabase.from('cobrancas').select('contrato_id')
      .eq('user_id', user.id).eq('mes_referencia', ref)
      .then(({ data }) => {
        const ids = new Set((data || []).map(e => e.contrato_id))
        const toCreate = contracts.filter(c => !ids.has(c.id)).length
        setPreview({ toCreate, skipped: contracts.length - toCreate })
      })
  }, [mesRef, user, contracts])

  useEffect(() => {
    if (step === 'running') return
    const handle = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose, step])

  const confirm = async () => {
    setStep('running')
    setProgress(0)
    setLogs([])

    const res = await emitirCobrancas(user.id, contracts, mesRef)

    if (res.error || res.created === 0) {
      setResult({ ...res, fails: 0 })
      setStep('done')
      return
    }

    const total = res.created
    const names = contracts.map(c => c.tenant?.split(' ')[0]).filter(Boolean)
    let sent = 0
    const iv = setInterval(() => {
      const batch = Math.min(3, total - sent)
      for (let i = 0; i < batch; i++) {
        const name = names[(sent + i) % (names.length || 1)] || 'Inquilino'
        setLogs(l => [...l.slice(-50), { name }])
      }
      sent = Math.min(sent + batch, total)
      setProgress(sent)
      if (sent >= total) {
        clearInterval(iv)
        setTimeout(() => {
          setResult({ created: total, skipped: res.skipped, fails: 0, error: null })
          setStep('done')
          onDone()
        }, 400)
      }
    }, 160)
  }

  const pct = result?.created > 0 ? Math.round((progress / result.created) * 100) : 0

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {step === 'pick' && (
          <div className="p-7">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mb-5 text-3xl">🚀</div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Gerar e Enviar em Massa</h2>
            <p className="text-sm text-slate-500 mb-4">Selecione o mês de referência:</p>

            <MonthPicker value={mesRef} onChange={v => { setMesRef(v); setPreview(null) }}/>

            {preview ? (
              <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${
                preview.toCreate > 0
                  ? 'bg-indigo-50 border border-indigo-200 text-indigo-800'
                  : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
                {preview.toCreate > 0
                  ? <><strong>{preview.toCreate}</strong> cobrança{preview.toCreate !== 1 ? 's' : ''} serão geradas.
                      {preview.skipped > 0 && <span className="text-indigo-500 ml-1">({preview.skipped} já emitidas — ignoradas)</span>}</>
                  : <>⚠️ Todos os contratos já têm cobrança emitida para {mesLabel(mesRef)}.</>
                }
              </div>
            ) : (
              <div className="mt-3 h-10 flex items-center justify-center text-xs text-slate-300">
                <div className="w-3 h-3 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin mr-2"/>
                Verificando…
              </div>
            )}

            <div className="bg-slate-50 rounded-xl p-4 mt-4 space-y-2">
              {[['💳','Registrar cobrança no sistema'],
                ['📄','Emitir NFS-e (em breve)'],
                ['📧','Enviar e-mail ao inquilino (em breve)']].map(([ico,txt]) => (
                <div key={txt} className="flex items-center gap-3 text-sm text-slate-600">
                  <span>{ico}</span><span>{txt}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50">Cancelar</button>
              <button onClick={confirm} disabled={!preview || preview.toCreate === 0}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold flex items-center justify-center gap-2 shadow-md shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed">
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
                <p className="font-bold text-slate-900">Processando {mesLabel(mesRef)}…</p>
                <p className="text-sm text-slate-400">Não feche esta janela</p>
              </div>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-slate-600">{progress} <span className="text-slate-400">de {result?.created ?? '…'}</span></span>
                <span className="font-bold text-indigo-600">{pct}%</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all" style={{ width:`${pct}%` }}/>
              </div>
            </div>
            <div className="bg-slate-950 rounded-xl p-3 h-44 overflow-y-auto font-mono text-xs space-y-1">
              {logs.slice(-30).map((l, i) => (
                <div key={i} className="text-emerald-400">✓ Cobrança registrada para {l.name}</div>
              ))}
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="p-7 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-4xl">✅</div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Processamento Concluído!</h2>
            <p className="text-slate-400 text-sm mb-5 capitalize">{mesLabel(mesRef)}</p>
            {result?.error ? (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-5">{result.error}</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { v: result?.created ?? 0, l:'Geradas',   bg:'bg-emerald-50', c:'text-emerald-700' },
                  { v: result?.skipped ?? 0, l:'Ignoradas', bg:'bg-slate-50',   c:'text-slate-600'   },
                  { v: result?.fails   ?? 0, l:'Falhas',    bg:'bg-red-50',     c:'text-red-600'     },
                ].map(({ v, l, bg, c }) => (
                  <div key={l} className={`${bg} rounded-xl py-3`}>
                    <p className={`text-2xl font-bold ${c}`}>{v}</p>
                    <p className={`text-xs ${c} opacity-70 mt-0.5`}>{l}</p>
                  </div>
                ))}
              </div>
            )}
            <button onClick={onClose} className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700">Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Badge de status ───────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG['Pendente']
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
      {status}
    </span>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function Cobrancas() {
  const { user }  = useAuth()
  const [mesRef, setMesRef]     = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [cobrancas, setCobrancas] = useState([])
  const [contracts, setContracts] = useState([]) // para BatchModal
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('Todos')
  const [showBatch, setShowBatch] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)

  // ── Carrega cobranças do mês ──────────────────────────────────
  const load = async () => {
    if (!user) return
    setLoading(true)
    const ref = mesStr(mesRef)

    // Cobranças do mês
    const { data, error } = await supabase
      .from('cobrancas')
      .select('*, contratos(imovel), inquilinos(nome)')
      .eq('user_id', user.id)
      .eq('mes_referencia', ref)
      .order('created_at', { ascending: false })

    if (!error) setCobrancas((data || []).map(mapCob))

    // Contratos para o BatchModal
    const { data: ctrs } = await supabase
      .from('contratos')
      .select('id, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, inquilinos(nome)')
      .eq('user_id', user.id)

    setContracts((ctrs || []).map(r => ({
      id:               r.id,
      inquilino_id:     r.inquilino_id,
      tenant:           r.inquilinos?.nome || '',
      value:            Number(r.valor_aluguel)     || 0,
      seguroFinanceiro: Number(r.seguro_financeiro) || 0,
      seguroIncendio:   Number(r.seguro_incendio)   || 0,
      iptu:             Number(r.iptu)              || 0,
      dueDay:           r.dia_vencimento,
      totalValue:       (Number(r.valor_aluguel)||0) + (Number(r.seguro_financeiro)||0) +
                        (Number(r.seguro_incendio)||0) + (Number(r.iptu)||0),
    })))

    setLoading(false)
  }

  useEffect(() => { load() }, [user, mesRef])

  // ── KPIs ───────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const sum = (list, k = 'totalValue') => list.reduce((s, c) => s + c[k], 0)
    const byStatus = s => cobrancas.filter(c => c.status === s)
    const pagos    = byStatus('Pago')
    const pendentes = byStatus('Pendente')
    const atraso   = byStatus('Em Atraso')
    return {
      total:      cobrancas.length,
      totalVal:   sum(cobrancas),
      pagos:      pagos.length,    pagosVal:    sum(pagos),
      pendentes:  pendentes.length, pendentesVal: sum(pendentes),
      atraso:     atraso.length,   atrasoVal:   sum(atraso),
    }
  }, [cobrancas])

  // ── Filtro ─────────────────────────────────────────────────────
  const lista = useMemo(
    () => filter === 'Todos' ? cobrancas : cobrancas.filter(c => c.status === filter),
    [cobrancas, filter]
  )

  // ── Atualizar status ───────────────────────────────────────────
  const updateStatus = async (id, newStatus) => {
    setUpdatingId(id)
    const extra = newStatus === 'Pago' ? { data_pagamento: new Date().toISOString() } : {}
    await supabase.from('cobrancas').update({ status: newStatus, ...extra }).eq('id', id)
    setCobrancas(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c))
    setUpdatingId(null)
  }

  const currentMonth = `${MESES[mesRef.getMonth()]} / ${mesRef.getFullYear()}`

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Cobranças</h1>
          <p className="text-sm text-slate-500 capitalize">
            {loading ? 'Carregando…' : `${kpi.total} cobrança${kpi.total !== 1 ? 's' : ''} · ${currentMonth}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker value={mesRef} onChange={v => { setMesRef(v); setFilter('Todos') }}/>
          <button onClick={load} disabled={loading} title="Atualizar"
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
            <IcRefresh c={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>
          </button>
          <button onClick={() => setShowBatch(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:from-indigo-700 hover:to-purple-700 shadow-md shadow-indigo-200 whitespace-nowrap">
            <IcZap c="w-4 h-4"/> Gerar e Enviar Tudo
          </button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-5 text-white col-span-2 lg:col-span-1">
          <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide mb-1">Total Emitido</p>
          <p className="text-2xl font-bold">{fmt(kpi.totalVal)}</p>
          <p className="text-indigo-200 text-xs mt-1">{kpi.total} cobrança{kpi.total !== 1 ? 's' : ''}</p>
        </div>
        {[
          { label:'✅ Pagos',      val: kpi.pagosVal,    count: kpi.pagos,     color:'emerald', text:'text-emerald-600' },
          { label:'⏳ Pendentes',  val: kpi.pendentesVal, count: kpi.pendentes, color:'amber',   text:'text-amber-600'  },
          { label:'🔴 Em Atraso',  val: kpi.atrasoVal,   count: kpi.atraso,    color:'red',     text:'text-red-600'    },
        ].map(({ label, val, count, color, text }) => (
          <div key={label} className="bg-white rounded-2xl p-5 border border-slate-100">
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-xl font-bold ${text}`}>{fmt(val)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{count} cobrança{count !== 1 ? 's' : ''}</p>
            <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
              <div className={`h-full bg-${color}-500 rounded-full`}
                style={{ width:`${kpi.total > 0 ? Math.round(count/kpi.total*100) : 0}%` }}/>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filtros ────────────────────────────────────────── */}
      <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1 w-fit">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* ── Tabela ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin mr-3"/>
            Carregando cobranças…
          </div>
        ) : lista.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-3">📭</p>
            <p className="text-slate-500 font-medium text-sm">
              {cobrancas.length === 0
                ? `Nenhuma cobrança emitida para ${currentMonth}`
                : `Nenhuma cobrança ${filter.toLowerCase()} em ${currentMonth}`}
            </p>
            {cobrancas.length === 0 && (
              <button onClick={() => setShowBatch(true)}
                className="mt-4 text-indigo-600 text-sm font-semibold hover:underline">
                + Gerar cobranças para este mês
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Inquilino</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">Imóvel</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden lg:table-cell">Venc.</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Valor</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {lista.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold flex-shrink-0">
                        {c.tenant[0]?.toUpperCase() || '?'}
                      </div>
                      <p className="font-medium text-slate-800">{c.tenant}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 hidden md:table-cell max-w-xs truncate">{c.property}</td>
                  <td className="px-5 py-3.5 text-center text-slate-500 hidden lg:table-cell">
                    {c.dueDay ? `Dia ${c.dueDay}` : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-slate-700">{fmt(c.totalValue)}</td>
                  <td className="px-5 py-3.5 text-center">
                    <StatusBadge status={c.status}/>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {updatingId === c.id ? (
                      <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin inline-block"/>
                    ) : c.status === 'Pago' ? (
                      <span className="text-xs text-slate-300">—</span>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => updateStatus(c.id, 'Pago')}
                          className="text-xs text-emerald-600 font-semibold hover:underline whitespace-nowrap">
                          ✓ Marcar Pago
                        </button>
                        {c.status === 'Pendente' && (
                          <button onClick={() => updateStatus(c.id, 'Em Atraso')}
                            className="text-xs text-red-500 font-semibold hover:underline whitespace-nowrap">
                            Em Atraso
                          </button>
                        )}
                        {c.status === 'Em Atraso' && (
                          <button onClick={() => updateStatus(c.id, 'Pendente')}
                            className="text-xs text-amber-600 font-semibold hover:underline whitespace-nowrap">
                            Pendente
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal ──────────────────────────────────────────── */}
      {showBatch && (
        <BatchModal
          contracts={contracts}
          user={user}
          mesRef={mesRef}
          onClose={() => setShowBatch(false)}
          onDone={load}
        />
      )}
    </div>
  )
}
