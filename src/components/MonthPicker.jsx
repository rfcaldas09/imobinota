import { MESES } from '../lib/cobrancas'

/**
 * Seletor de mês/ano com navegação por seta.
 * Props:
 *   value    — Date (qualquer dia do mês desejado)
 *   onChange — (Date) => void
 */
export default function MonthPicker({ value, onChange }) {
  const y = value.getFullYear()
  const m = value.getMonth()
  const go = delta => onChange(new Date(y, m + delta, 1))

  return (
    <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 overflow-hidden select-none">
      <button
        onClick={() => go(-1)}
        className="px-3 py-2.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors font-bold text-base leading-none">
        ‹
      </button>
      <span className="flex-1 text-center font-semibold text-slate-800 text-sm py-2.5">
        {MESES[m]} / {y}
      </span>
      <button
        onClick={() => go(+1)}
        className="px-3 py-2.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors font-bold text-base leading-none">
        ›
      </button>
    </div>
  )
}
