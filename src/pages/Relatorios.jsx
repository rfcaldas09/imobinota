import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { MESES } from '../lib/cobrancas'

const fmt  = v => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
const fmtN = v => Number(v).toLocaleString('pt-BR')

const ic = (d, cls='') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${cls}`}
    dangerouslySetInnerHTML={{ __html: d }} />
)
const IcRefresh = ({ c='' }) => ic('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', c)
const IcDownload = ({ c='' }) => ic('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', c)

function KPICard({ icon, label, value, sub, iconBg }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${iconBg}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function Relatorios() {
  const { user } = useAuth()
  const now      = new Date()
  const [year, setYear]       = useState(now.getFullYear())
  const [rows, setRows]       = useState([])   // linhas brutas do banco
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('cobrancas')
      .select('mes_referencia, valor_total, status')
      .eq('user_id', user.id)
      .gte('mes_referencia', `${year}-01-01`)
      .lte('mes_referencia', `${year}-12-31`)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [user, year])

  // ── Agrega por mês ─────────────────────────────────────────────
  const months = useMemo(() => {
    return MESES.map((label, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}-01`
      const mes = rows.filter(r => r.mes_referencia === key)

      const paidVal    = mes.filter(r => r.status === 'Pago').reduce((s, r) => s + Number(r.valor_total), 0)
      const overdueVal = mes.filter(r => r.status === 'Em Atraso').reduce((s, r) => s + Number(r.valor_total), 0)
      const pendVal    = mes.filter(r => r.status === 'Pendente').reduce((s, r) => s + Number(r.valor_total), 0)
      const paidN      = mes.filter(r => r.status === 'Pago').length
      const overdueN   = mes.filter(r => r.status === 'Em Atraso').length
      const pendN      = mes.filter(r => r.status === 'Pendente').length
      const total      = paidVal + overdueVal + pendVal
      const adim       = total > 0 ? Math.round((paidVal / total) * 100) : null
      const isCurrent  = i === now.getMonth() && year === now.getFullYear()
      const isFuture   = new Date(year, i, 1) > now

      return { key, label, paidVal, overdueVal, pendVal, paidN, overdueN, pendN, total, adim, isCurrent, isFuture, count: mes.length }
    })
  }, [rows, year])

  // Apenas meses com dados (para médias e totais)
  const comDados = useMemo(() => months.filter(m => m.count > 0), [months])

  // ── KPIs anuais ────────────────────────────────────────────────
  const ann = useMemo(() => {
    const paidVal    = comDados.reduce((s, m) => s + m.paidVal,    0)
    const overdueVal = comDados.reduce((s, m) => s + m.overdueVal, 0)
    const pendVal    = comDados.reduce((s, m) => s + m.pendVal,    0)
    const total      = paidVal + overdueVal + pendVal
    return {
      paidVal, overdueVal, pendVal, total,
      adimplencia: total > 0 ? Math.round((paidVal / total) * 100) : 0,
      media: comDados.length > 0 ? Math.round(paidVal / comDados.length) : 0,
      mesesComDados: comDados.length,
    }
  }, [comDados])

  const exportCSV = () => {
    const header = 'Mês,Arrecadado,Em Atraso,Pendente,Adimplência,Pagos,Inadimplentes,Pendentes'
    const lines = months
      .filter(m => m.count > 0)
      .map(m => [
        `${m.label}/${year}`,
        m.paidVal.toFixed(2),
        m.overdueVal.toFixed(2),
        m.pendVal.toFixed(2),
        m.adim !== null ? `${m.adim}%` : '—',
        m.paidN, m.overdueN, m.pendN,
      ].join(','))
    const csv = [header, ...lines].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }))
    a.download = `relatorio_${year}.csv`
    a.click()
  }

  const currentMonthIdx = now.getMonth()

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Relatórios</h1>
          <p className="text-sm text-slate-500">
            {loading ? 'Carregando…' : `Visão anual de arrecadação e inadimplência · ${ann.mesesComDados} mês${ann.mesesComDados !== 1 ? 'es' : ''} com dados`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Seletor de ano */}
          <div className="flex items-center border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm select-none">
            <button onClick={() => setYear(y => y - 1)}
              className="px-3 py-2 text-slate-500 hover:bg-slate-100 font-bold text-base leading-none transition-colors">‹</button>
            <span className="px-4 font-semibold text-slate-800 text-sm">{year}</span>
            <button onClick={() => setYear(y => y + 1)}
              className="px-3 py-2 text-slate-500 hover:bg-slate-100 font-bold text-base leading-none transition-colors">›</button>
          </div>
          <button onClick={load} disabled={loading} title="Atualizar"
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
            <IcRefresh c={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>
          </button>
          <button onClick={exportCSV} disabled={loading || ann.mesesComDados === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-40">
            <IcDownload c="w-4 h-4"/> CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32 text-slate-400 text-sm">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin mr-3"/>
          Carregando dados…
        </div>
      ) : ann.mesesComDados === 0 ? (
        <div className="text-center py-32">
          <p className="text-5xl mb-3">📭</p>
          <p className="text-slate-500 font-medium">Nenhuma cobrança emitida em {year}</p>
          <p className="text-slate-400 text-sm mt-1">Gere cobranças no Dashboard ou na aba Contratos</p>
        </div>
      ) : (
        <>
          {/* ── KPI Cards ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KPICard
              icon={<span className="text-lg">💰</span>}
              label={`Arrecadado ${year}`}
              value={fmt(ann.paidVal)}
              sub={`${ann.mesesComDados} mês${ann.mesesComDados !== 1 ? 'es' : ''} com dados`}
              iconBg="bg-emerald-100 text-emerald-600"
            />
            <KPICard
              icon={<span className="text-lg">🔴</span>}
              label="Em Atraso (total)"
              value={fmt(ann.overdueVal)}
              sub="No período"
              iconBg="bg-red-100 text-red-600"
            />
            <KPICard
              icon={<span className="text-lg">📊</span>}
              label="Adimplência"
              value={`${ann.adimplencia}%`}
              sub="% sobre total gerado"
              iconBg="bg-indigo-100 text-indigo-600"
            />
            <KPICard
              icon={<span className="text-lg">📅</span>}
              label="Média Mensal"
              value={fmt(ann.media)}
              sub="Arrecadado por mês"
              iconBg="bg-purple-100 text-purple-600"
            />
          </div>

          {/* ── Tabela detalhada ───────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Detalhamento por Mês — {year}</h2>
                {year === now.getFullYear() && (
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full mt-1 inline-block">
                    parcial — até {MESES[currentMonthIdx]}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400">{ann.mesesComDados} meses</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Mês','Arrecadado','Pendente','Em Atraso','Adimplência','Pagos','Inadimp.'].map((h, i) => (
                      <th key={h} className={`px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-center'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {months.filter(m => !m.isFuture || m.count > 0).map(m => (
                    <tr key={m.key}
                      className={`hover:bg-slate-50 transition-colors ${m.isCurrent ? 'bg-indigo-50/40' : ''} ${m.count === 0 ? 'opacity-40' : ''}`}>
                      <td className="px-5 py-3 font-medium text-slate-800">
                        {m.label}
                        {m.isCurrent && (
                          <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-semibold ml-2">atual</span>
                        )}
                        {m.count === 0 && (
                          <span className="text-xs text-slate-300 ml-2">sem dados</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center font-semibold text-emerald-700 tabular-nums">
                        {m.count > 0 ? fmt(m.paidVal) : '—'}
                      </td>
                      <td className="px-5 py-3 text-center font-medium text-amber-600 tabular-nums">
                        {m.count > 0 ? fmt(m.pendVal) : '—'}
                      </td>
                      <td className="px-5 py-3 text-center font-medium text-red-500 tabular-nums">
                        {m.count > 0 ? fmt(m.overdueVal) : '—'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {m.adim !== null ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="h-1.5 w-20 bg-slate-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${m.adim >= 95 ? 'bg-emerald-500' : m.adim >= 70 ? 'bg-amber-400' : 'bg-red-400'}`}
                                style={{ width:`${m.adim}%` }}/>
                            </div>
                            <span className={`text-xs font-semibold tabular-nums w-9 ${m.adim >= 95 ? 'text-emerald-700' : m.adim >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                              {m.adim}%
                            </span>
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-center font-medium text-slate-700">
                        {m.count > 0 ? fmtN(m.paidN) : '—'}
                      </td>
                      <td className="px-5 py-3 text-center font-medium text-red-500">
                        {m.count > 0 ? fmtN(m.overdueN) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td className="px-5 py-3 font-bold text-slate-900">Total {year}</td>
                    <td className="px-5 py-3 text-center font-bold text-emerald-700 tabular-nums">{fmt(ann.paidVal)}</td>
                    <td className="px-5 py-3 text-center font-bold text-amber-600 tabular-nums">{fmt(ann.pendVal)}</td>
                    <td className="px-5 py-3 text-center font-bold text-red-500 tabular-nums">{fmt(ann.overdueVal)}</td>
                    <td className="px-5 py-3 text-center font-bold text-slate-700">{ann.adimplencia}%</td>
                    <td colSpan={2}/>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
