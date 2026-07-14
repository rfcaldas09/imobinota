import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { mesLabel, mesStr, MESES } from '../lib/cobrancas'
import MonthPicker from '../components/MonthPicker'

const ic = (d, cls='') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${cls}`}
    dangerouslySetInnerHTML={{ __html: d }} />
)
const IcCheck    = ({ c='' }) => ic('<polyline points="20 6 9 17 4 12"/>', c)
const IcCalendar = ({ c='' }) => ic('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', c)
const IcRefresh  = ({ c='' }) => ic('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', c)

const fmt     = v => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
const fmtMonth = () => new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

// ── Mapeia linha do banco para objeto UI ────────────────────────────
const mapRow = row => ({
  id:               row.id,
  inquilino_id:     row.inquilino_id,
  tenant:           row.inquilinos?.nome   || '',
  property:         row.imovel             || '',
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


// ── Mapeia linha de cobrança ────────────────────────────────────────
const mapCob = row => ({
  id:         row.id,
  tenant:     row.inquilinos?.nome  || row.contratos?.inquilinos?.nome || '—',
  property:   row.contratos?.imovel || '—',
  totalValue: Number(row.valor_total) || 0,
  status:     row.status || 'Pendente',
})

// ── Componente principal ───────────────────────────────────────────
export default function Dashboard() {
  const { user }  = useAuth()
  const [view, setView]   = useState('mensal') // 'mensal' | 'anual'
  const [contracts, setContracts] = useState([])
  const [cobrancas, setCobrancas] = useState([])   // mês atual
  const [cobAnuais, setCobAnuais] = useState([])   // todos do ano (para visão anual)
  const [mesRef, setMesRef] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [ano, setAno]       = useState(() => new Date().getFullYear())
  const [loading, setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = async () => {
    if (!user) return
    setLoading(true)

    // Contratos (sempre — usado em vencimentos)
    const { data: ctrData } = await supabase
      .from('contratos')
      .select('*, inquilinos(nome)')
      .eq('user_id', user.id)
    setContracts((ctrData || []).map(mapRow))

    if (view === 'mensal') {
      const { data: cobData } = await supabase
        .from('cobrancas')
        .select('*, contratos(imovel), inquilinos(nome)')
        .eq('user_id', user.id)
        .eq('mes_referencia', mesStr(mesRef))
      setCobrancas((cobData || []).map(mapCob))
    } else {
      // Anual: carrega todas as cobranças do ano
      const { data: cobData } = await supabase
        .from('cobrancas')
        .select('id, mes_referencia, valor_total, status, contratos(imovel), inquilinos(nome)')
        .eq('user_id', user.id)
        .gte('mes_referencia', `${ano}-01-01`)
        .lte('mes_referencia', `${ano}-12-31`)
      setCobAnuais(cobData || [])
      setCobrancas([]) // limpa visão mensal
    }

    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => { load() }, [user, mesRef, view, ano])

  // ── KPIs mensais ──────────────────────────────────────────────────
  const paid    = useMemo(() => cobrancas.filter(c => c.status === 'Pago'),      [cobrancas])
  const pending = useMemo(() => cobrancas.filter(c => c.status === 'Pendente'),  [cobrancas])
  const overdue = useMemo(() => cobrancas.filter(c => c.status === 'Em Atraso'), [cobrancas])

  const paidVal    = useMemo(() => paid.reduce((s,c)    => s + c.totalValue, 0), [paid])
  const pendingVal = useMemo(() => pending.reduce((s,c)  => s + c.totalValue, 0), [pending])
  const overdueVal = useMemo(() => overdue.reduce((s,c)  => s + c.totalValue, 0), [overdue])
  const totalVal   = paidVal + pendingVal + overdueVal
  const pct = v => totalVal > 0 ? Math.round((v / totalVal) * 100) : 0

  // ── KPIs anuais ───────────────────────────────────────────────────
  const anuais = useMemo(() => {
    const sum = s => cobAnuais.filter(c => c.status === s).reduce((a, c) => a + Number(c.valor_total), 0)
    const tot = cobAnuais.reduce((a, c) => a + Number(c.valor_total), 0)
    return {
      total: tot,
      pagos: sum('Pago'),      pagosN: cobAnuais.filter(c => c.status === 'Pago').length,
      pend:  sum('Pendente'),  pendN:  cobAnuais.filter(c => c.status === 'Pendente').length,
      atras: sum('Em Atraso'), atrasN: cobAnuais.filter(c => c.status === 'Em Atraso').length,
      count: cobAnuais.length,
    }
  }, [cobAnuais])

  // Agrega cobranças por mês para o gráfico anual
  const barras = useMemo(() => {
    return MESES.map((label, i) => {
      const key = `${ano}-${String(i + 1).padStart(2, '0')}-01`
      const rows = cobAnuais.filter(c => c.mes_referencia === key)
      return {
        label: label.slice(0, 3),
        pago:     rows.filter(c => c.status === 'Pago').reduce((s, c) => s + Number(c.valor_total), 0),
        pendente: rows.filter(c => c.status === 'Pendente').reduce((s, c) => s + Number(c.valor_total), 0),
        atraso:   rows.filter(c => c.status === 'Em Atraso').reduce((s, c) => s + Number(c.valor_total), 0),
        isNow: i === new Date().getMonth() && ano === new Date().getFullYear(),
      }
    })
  }, [cobAnuais, ano])

  // Cobranças em atraso na visão anual (mapeadas igual ao mapCob)
  const overdueAnuais = useMemo(
    () => cobAnuais
      .filter(r => r.status === 'Em Atraso')
      .map(r => {
        const d = r.mes_referencia ? new Date(r.mes_referencia + 'T00:00:00') : null
        const mesLabel = d ? `${MESES[d.getMonth()]}/${d.getFullYear()}` : '—'
        return {
          id:         r.id,
          tenant:     r.inquilinos?.nome   || '—',
          property:   r.contratos?.imovel  || '—',
          totalValue: Number(r.valor_total) || 0,
          mesLabel,
        }
      })
      .sort((a, b) => a.mesLabel.localeCompare(b.mesLabel)),
    [cobAnuais]
  )

  const maxBarra = useMemo(
    () => Math.max(...barras.map(b => b.pago + b.pendente + b.atraso), 1),
    [barras]
  )

  // Contratos vencendo nos próximos 60 dias
  const expiring = useMemo(() => {
    const now = new Date()
    return contracts
      .filter(c => {
        if (!c.end) return false
        const diff = (new Date(c.end) - now) / 86400000
        return diff >= 0 && diff <= 60
      })
      .sort((a, b) => new Date(a.end) - new Date(b.end))
  }, [contracts])

  // Distribuição de vencimentos por mês (próximos 12 meses)
  const expiryByMonth = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      return {
        key,
        label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        count: 0,
        isNow: i === 0,
      }
    })
    contracts.forEach(c => {
      if (!c.end) return
      const d = new Date(c.end)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const m = months.find(x => x.key === key)
      if (m) m.count++
    })
    return months
  }, [contracts])

  const maxExpiryCount = useMemo(
    () => Math.max(...expiryByMonth.map(m => m.count), 1),
    [expiryByMonth]
  )

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {loading ? 'Carregando…' : `${contracts.length} contrato${contracts.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap justify-end">

          {/* Toggle Mensal / Anual */}
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            {['mensal','anual'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {v === 'mensal' ? '📅 Mensal' : '📊 Anual'}
              </button>
            ))}
          </div>

          {/* Seletor de período */}
          {view === 'mensal' ? (
            <MonthPicker value={mesRef} onChange={v => setMesRef(v)}/>
          ) : (
            <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 overflow-hidden select-none">
              <button onClick={() => setAno(a => a - 1)}
                className="px-3 py-2.5 text-slate-500 hover:bg-slate-200 font-bold text-base leading-none">‹</button>
              <span className="px-4 font-semibold text-slate-800 text-sm">{ano}</span>
              <button onClick={() => setAno(a => a + 1)}
                className="px-3 py-2.5 text-slate-500 hover:bg-slate-200 font-bold text-base leading-none">›</button>
            </div>
          )}

          <button onClick={load} disabled={loading} title="Atualizar"
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-all">
            <IcRefresh c={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32 text-slate-400 text-sm">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin mr-3"/>
          Carregando dados…
        </div>
      ) : (
        <>
          {/* ── KPI Cards ──────────────────────────────────────── */}
          {view === 'mensal' ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-5 text-white col-span-2 lg:col-span-1">
                  <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide mb-1">Total Emitido</p>
                  <p className="text-2xl font-bold mb-1">{fmt(totalVal)}</p>
                  <p className="text-indigo-200 text-xs">
                    {cobrancas.length > 0
                      ? `${cobrancas.length} cobrança${cobrancas.length !== 1 ? 's' : ''} · ${mesLabel(mesRef)}`
                      : `Sem cobranças em ${mesLabel(mesRef)}`}
                  </p>
                </div>
                {[
                  { label:'✅ Pagos',     val: paidVal,    list: paid,    color:'emerald', text:'text-emerald-600' },
                  { label:'⏳ Pendentes', val: pendingVal, list: pending, color:'amber',   text:'text-amber-600'  },
                  { label:'🔴 Em Atraso', val: overdueVal, list: overdue, color:'red',     text:'text-red-600'    },
                ].map(({ label, val, list, color, text }) => (
                  <div key={label} className="bg-white rounded-2xl p-5 border border-slate-100">
                    <div className="mb-3">
                      <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">{label}</p>
                      <p className={`text-xl font-bold ${text}`}>{fmt(val)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{list.length} cobrança{list.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full bg-${color}-500 rounded-full transition-all`} style={{ width:`${pct(val)}%` }}/>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{pct(val)}% do total</p>
                  </div>
                ))}
              </div>

              {/* Progresso mensal */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-slate-900">Progresso de Recebimento</p>
                    <p className="text-xs text-slate-400">{mesLabel(mesRef)}</p>
                  </div>
                  <p className="text-2xl font-bold text-emerald-600">{pct(paidVal)}%</p>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width:`${pct(paidVal)}%` }}/>
                  <div className="h-full bg-amber-400 transition-all duration-500" style={{ width:`${pct(pendingVal)}%` }}/>
                  <div className="h-full bg-red-500 transition-all duration-500"   style={{ width:`${pct(overdueVal)}%` }}/>
                </div>
                <div className="flex gap-4 mt-2 flex-wrap">
                  {[
                    ['bg-emerald-500', 'Pagos',     paid.length,    paidVal],
                    ['bg-amber-400',   'Pendentes', pending.length, pendingVal],
                    ['bg-red-500',     'Em Atraso', overdue.length, overdueVal],
                  ].map(([bg, label, count, val]) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
                      <div className={`w-2.5 h-2.5 rounded-full ${bg}`}/>
                      {label} <span className="font-medium text-slate-700">({count} cob.)</span>
                      <span className="text-slate-400">· {fmt(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* ── KPIs anuais ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-5 text-white col-span-2 lg:col-span-1">
                  <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide mb-1">Total Anual</p>
                  <p className="text-2xl font-bold mb-1">{fmt(anuais.total)}</p>
                  <p className="text-indigo-200 text-xs">{anuais.count} cobrança{anuais.count !== 1 ? 's' : ''} · {ano}</p>
                </div>
                {[
                  { label:'✅ Pagos',     val: anuais.pagos, n: anuais.pagosN, color:'emerald', text:'text-emerald-600' },
                  { label:'⏳ Pendentes', val: anuais.pend,  n: anuais.pendN,  color:'amber',   text:'text-amber-600'  },
                  { label:'🔴 Em Atraso', val: anuais.atras, n: anuais.atrasN, color:'red',     text:'text-red-600'    },
                ].map(({ label, val, n, color, text }) => {
                  const p = anuais.total > 0 ? Math.round((val / anuais.total) * 100) : 0
                  return (
                    <div key={label} className="bg-white rounded-2xl p-5 border border-slate-100">
                      <div className="mb-3">
                        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">{label}</p>
                        <p className={`text-xl font-bold ${text}`}>{fmt(val)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{n} cobrança{n !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full bg-${color}-500 rounded-full`} style={{ width:`${p}%` }}/>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{p}% do total</p>
                    </div>
                  )
                })}
              </div>

              {/* ── Gráfico de barras anual ── */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-semibold text-slate-900">Arrecadamento por Mês</p>
                    <p className="text-xs text-slate-400">{ano}</p>
                  </div>
                  <div className="flex gap-3">
                    {[['bg-emerald-500','Pago'],['bg-amber-400','Pendente'],['bg-red-400','Em Atraso']].map(([bg, l]) => (
                      <div key={l} className="flex items-center gap-1.5 text-xs text-slate-500">
                        <div className={`w-2 h-2 rounded-sm ${bg}`}/>{l}
                      </div>
                    ))}
                  </div>
                </div>
                {anuais.count === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">📭 Sem cobranças em {ano}</p>
                ) : (
                  <div className="flex items-end gap-1.5 h-40">
                    {barras.map(b => {
                      const total = b.pago + b.pendente + b.atraso
                      const hPago = total > 0 ? (b.pago / maxBarra) * 100 : 0
                      const hPend = total > 0 ? (b.pendente / maxBarra) * 100 : 0
                      const hAtr  = total > 0 ? (b.atraso / maxBarra) * 100 : 0
                      const adim  = total > 0 ? Math.round((b.pago / total) * 100) : null
                      const adimColor = adim === null ? 'text-slate-200'
                        : adim >= 90 ? 'text-emerald-600'
                        : adim >= 60 ? 'text-amber-500'
                        : 'text-red-500'
                      return (
                        <div key={b.label} className="flex-1 flex flex-col items-center gap-0.5">
                          {/* % adimplência acima da barra */}
                          <span className={`text-[10px] font-bold leading-none ${adimColor}`}
                            title={adim !== null ? `Adimplência: ${adim}%` : 'Sem cobranças'}>
                            {adim !== null ? `${adim}%` : '·'}
                          </span>
                          <div className="w-full flex flex-col justify-end" style={{ height: '110px' }}>
                            <div title={`Em Atraso: ${fmt(b.atraso)}`}
                              className="w-full bg-red-400 rounded-t transition-all"
                              style={{ height:`${hAtr}%` }}/>
                            <div title={`Pendente: ${fmt(b.pendente)}`}
                              className="w-full bg-amber-400 transition-all"
                              style={{ height:`${hPend}%` }}/>
                            <div title={`Pago: ${fmt(b.pago)}`}
                              className={`w-full bg-emerald-500 transition-all ${hAtr === 0 && hPend === 0 ? 'rounded-t' : ''}`}
                              style={{ height:`${hPago}%` }}/>
                          </div>
                          <span className={`text-[10px] leading-tight ${b.isNow ? 'font-bold text-indigo-600' : 'text-slate-400'}`}>
                            {b.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Painéis inferiores ─────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Vencimentos por mês */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <IcCalendar c="w-4 h-4 text-indigo-500"/>
                <h3 className="font-semibold text-slate-900 text-sm">Vencimentos de Contrato</h3>
              </div>
              {expiryByMonth.some(m => m.count > 0) ? (
                <div className="space-y-2">
                  {expiryByMonth.map(m => (
                    <div key={m.key} className="flex items-center gap-2">
                      <span className={`text-xs w-16 flex-shrink-0 ${m.isNow ? 'font-semibold text-indigo-600' : 'text-slate-500'}`}>
                        {m.label}
                      </span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${m.isNow ? 'bg-indigo-500' : m.count > 0 ? 'bg-slate-400' : ''}`}
                          style={{ width:`${(m.count / maxExpiryCount) * 100}%` }}
                        />
                      </div>
                      <span className={`text-xs w-5 text-right font-medium ${m.count > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                        {m.count || '·'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-6">
                  Nenhum contrato com data de término nos próximos 12 meses
                </p>
              )}
            </div>

            {/* Em Atraso */}
            {(() => {
              const lista   = view === 'anual' ? overdueAnuais : overdue
              const isEmpty = view === 'anual' ? cobAnuais.length === 0 : cobrancas.length === 0
              const periodo = view === 'anual' ? `em ${ano}` : 'neste mês'
              return (
                <div className="bg-white rounded-2xl border border-slate-100 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span>🔴</span>
                      <h3 className="font-semibold text-slate-900 text-sm">Em Atraso</h3>
                    </div>
                    {lista.length > 0 && (
                      <span className="text-xs bg-red-50 text-red-600 font-semibold px-2 py-0.5 rounded-full">
                        {lista.length} cobrança{lista.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {lista.length > 0 ? (
                    <div className="space-y-2.5">
                      {lista.slice(0, 5).map(c => (
                        <div key={c.id} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-700 text-xs font-bold flex-shrink-0">
                              {c.tenant[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm text-slate-800 font-medium truncate">{c.tenant}</p>
                              <p className="text-xs text-slate-400 truncate">{c.property}</p>
                              {view === 'anual' && c.mesLabel && (
                                <p className="text-xs text-red-400 font-semibold mt-0.5">desde {c.mesLabel}</p>
                              )}
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-red-600 flex-shrink-0">{fmt(c.totalValue)}</p>
                        </div>
                      ))}
                      {lista.length > 5 && (
                        <p className="text-xs text-slate-400 text-center pt-1">+{lista.length - 5} outras em atraso</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-6">
                      {isEmpty ? `📭 Sem cobranças emitidas ${periodo}` : '🎉 Nenhuma cobrança em atraso!'}
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Contratos por Vencer */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <IcCalendar c="w-4 h-4 text-amber-500"/>
                <h3 className="font-semibold text-slate-900 text-sm">Contratos por Vencer</h3>
                {expiring.length > 0 && (
                  <span className="ml-auto text-xs bg-amber-50 text-amber-600 font-semibold px-2 py-0.5 rounded-full">
                    {expiring.length}
                  </span>
                )}
              </div>
              {expiring.length > 0 ? (
                <div className="space-y-2.5">
                  {expiring.slice(0, 5).map(c => {
                    const days = Math.ceil((new Date(c.end) - new Date()) / 86400000)
                    const urgent = days <= 15
                    return (
                      <div key={c.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {c.tenant[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-slate-800 font-medium truncate">{c.tenant.split(' ')[0]}</p>
                            <p className="text-xs text-slate-400">{fmtDate(c.end)}</p>
                          </div>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${urgent ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                          {days}d
                        </span>
                      </div>
                    )
                  })}
                  {expiring.length > 5 && (
                    <p className="text-xs text-slate-400 text-center pt-1">+{expiring.length - 5} outros</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-6">
                  Nenhum contrato vence nos próximos 60 dias
                </p>
              )}
            </div>
          </div>

          {/* ── Rodapé de atualização ─────────────────────────── */}
          {lastUpdated && (
            <p className="text-center text-xs text-slate-300">
              Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}
            </p>
          )}
        </>
      )}

    </div>
  )
}
