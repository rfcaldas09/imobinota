import { useState } from 'react'
import { MONTHS_DATA, fmt, fmtN } from '../data/mockData'

const ANNUAL_YEARS = [2025, 2026]

function annualData(yr) {
  const months     = MONTHS_DATA.filter(m => m.yr === yr)
  const paidVal    = months.reduce((s,m) => s + m.paidVal, 0)
  const overdueVal = months.reduce((s,m) => s + m.overdueVal, 0)
  const total      = paidVal + overdueVal
  return {
    months,
    paidVal,
    overdueVal,
    total,
    adimplencia: total > 0 ? Math.round(paidVal / total * 100) : 0,
    media:       months.length > 0 ? Math.round(paidVal / months.length) : 0,
  }
}

function KPICard({ icon, label, value, sub, accent }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 p-5 ${accent ? 'border-l-4 border-l-indigo-500' : ''}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${accent ?? 'bg-indigo-100 text-indigo-600'}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function Relatorios() {
  const [year, setYear] = useState(2026)
  const ann = annualData(year)

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header + seletor */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Relatórios</h1>
          <p className="text-sm text-slate-500">Visão anual de arrecadação e inadimplência</p>
        </div>
        <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {ANNUAL_YEARS.map(yr => (
            <button key={yr} onClick={() => setYear(yr)}
              className={`px-5 py-2 text-sm font-semibold transition-colors ${year === yr ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {yr}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs anuais */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          icon={<span className="text-lg">💰</span>}
          label={`Arrecadado ${year}`}
          value={fmt(ann.paidVal)}
          sub={`${ann.months.length} meses`}
          accent="bg-emerald-100 text-emerald-600"
        />
        <KPICard
          icon={<span className="text-lg">🔴</span>}
          label="Em Atraso (total)"
          value={fmt(ann.overdueVal)}
          sub="No período"
          accent="bg-red-100 text-red-600"
        />
        <KPICard
          icon={<span className="text-lg">📊</span>}
          label="Adimplência"
          value={`${ann.adimplencia}%`}
          sub="% sobre total gerado"
          accent="bg-indigo-100 text-indigo-600"
        />
        <KPICard
          icon={<span className="text-lg">📅</span>}
          label="Média Mensal"
          value={fmt(ann.media)}
          sub="Por mês arrecadado"
          accent="bg-purple-100 text-purple-600"
        />
      </div>

      {/* Tabela detalhada por mês */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Detalhamento por Mês — {year}</h2>
            {year === 2026 && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full mt-0.5 inline-block">
                parcial (Jan–Jul)
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400">{ann.months.length} meses</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Mês','Arrecadado','Em Atraso','Adimplência','Pagos','Inadimplentes'].map((h,i) => (
                  <th key={h} className={`px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide ${i===0?'text-left':'text-center'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ann.months.map(md => {
                const tot  = md.paidVal + md.overdueVal
                const adim = tot > 0 ? Math.round(md.paidVal / tot * 100) : 0
                const isCur = md.key === '2026-07'
                return (
                  <tr key={md.key} className={`hover:bg-slate-50 transition-colors ${isCur ? 'bg-indigo-50/40' : ''}`}>
                    <td className="px-5 py-3 font-medium text-slate-800">
                      {md.label}
                      {isCur && <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-semibold ml-2">atual</span>}
                    </td>
                    <td className="px-5 py-3 text-center font-semibold text-emerald-700 tabular-nums">{fmt(md.paidVal)}</td>
                    <td className="px-5 py-3 text-center font-medium text-red-500 tabular-nums">{fmt(md.overdueVal)}</td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-1.5 w-20 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${adim >= 95 ? 'bg-emerald-500' : adim >= 85 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${adim}%` }}/>
                        </div>
                        <span className="text-xs font-semibold text-slate-700 tabular-nums w-9">{adim}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center font-medium text-slate-700">{fmtN(md.paid)}</td>
                    <td className="px-5 py-3 text-center font-medium text-red-500">{fmtN(md.overdue)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td className="px-5 py-3 font-bold text-slate-900">Total {year}</td>
                <td className="px-5 py-3 text-center font-bold text-emerald-700 tabular-nums">{fmt(ann.paidVal)}</td>
                <td className="px-5 py-3 text-center font-bold text-red-500 tabular-nums">{fmt(ann.overdueVal)}</td>
                <td className="px-5 py-3 text-center font-bold text-slate-700">{ann.adimplencia}%</td>
                <td colSpan={2}/>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
