const STYLES = {
  "Pago":      "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "Pendente":  "bg-amber-50 text-amber-700 border border-amber-200",
  "Em Atraso": "bg-red-50 text-red-700 border border-red-200",
}
const DOTS = {
  "Pago":      "bg-emerald-500",
  "Pendente":  "bg-amber-500",
  "Em Atraso": "bg-red-500",
}

export default function Badge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STYLES[status] ?? 'bg-slate-100 text-slate-600'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${DOTS[status] ?? 'bg-slate-400'}`} />
      {status}
    </span>
  )
}
