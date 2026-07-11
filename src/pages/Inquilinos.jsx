import { useState, useMemo } from 'react'
import { CONTRACTS, fmt, fmtDate } from '../data/mockData'
import Badge from '../components/Badge'

const ic = (d, cls='') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${cls}`}
    dangerouslySetInnerHTML={{ __html: d }} />
)
const IcSearch = ({ c='' }) => ic('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', c)
const IcX      = ({ c='' }) => ic('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', c)
const IcMail   = ({ c='' }) => ic('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>', c)
const IcPhone  = ({ c='' }) => ic('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.11h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8a16 16 0 0 0 6 6l.27-.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16z"/>', c)

export default function Inquilinos() {
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState(null)

  // Derivar inquilinos únicos dos contratos
  const inquilinos = useMemo(() => {
    const map = {}
    CONTRACTS.forEach(c => {
      if (!map[c.cpf]) {
        map[c.cpf] = {
          cpf:    c.cpf,
          name:   c.tenant,
          email:  c.email,
          phone:  c.phone,
          contracts: [],
        }
      }
      map[c.cpf].contracts.push(c)
    })
    return Object.values(map)
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return inquilinos
    return inquilinos.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.email.toLowerCase().includes(q) ||
      i.cpf.includes(q) ||
      i.phone.includes(q)
    )
  }, [search, inquilinos])

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Inquilinos</h1>
          <p className="text-sm text-slate-500">{filtered.length} de {inquilinos.length} inquilinos</p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <IcSearch c="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, CPF, e-mail…"
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"/>
      </div>

      {/* Grid de cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(i => {
          const hasOverdue = i.contracts.some(c => c.status === 'Em Atraso')
          const totalVal   = i.contracts.reduce((s, c) => s + (c.totalValue || 0), 0)
          return (
            <button key={i.cpf} onClick={() => setSelected(i)}
              className="bg-white rounded-2xl border border-slate-100 p-4 text-left hover:border-indigo-200 hover:shadow-md transition-all">
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${hasOverdue ? 'bg-red-500' : 'bg-indigo-600'}`}>
                  {i.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">{i.name}</p>
                  <p className="text-xs text-slate-400">{i.cpf}</p>
                </div>
                {hasOverdue && <span className="text-xs bg-red-50 text-red-600 font-semibold px-2 py-0.5 rounded-full flex-shrink-0">Em Atraso</span>}
              </div>
              <div className="space-y-1 text-xs text-slate-500">
                <div className="flex items-center gap-1.5"><IcMail c="w-3.5 h-3.5"/>{i.email}</div>
                <div className="flex items-center gap-1.5"><IcPhone c="w-3.5 h-3.5"/>{i.phone}</div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">{i.contracts.length} contrato{i.contracts.length !== 1 ? 's' : ''}</span>
                <span className="text-sm font-bold text-slate-800">{fmt(totalVal)}<span className="text-xs font-normal text-slate-400">/mês</span></span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Drawer de detalhe */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setSelected(null)}/>
          <div className="w-full max-w-sm bg-white h-full shadow-2xl overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">Perfil do Inquilino</h2>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700"><IcX c="w-5 h-5"/></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Avatar + nome */}
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl font-bold">
                  {selected.name[0]}
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-lg">{selected.name}</p>
                  <p className="text-sm text-slate-500">{selected.cpf}</p>
                </div>
              </div>
              {/* Contato */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <IcMail c="w-4 h-4 text-slate-400"/>{selected.email}
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <IcPhone c="w-4 h-4 text-slate-400"/>{selected.phone}
                </div>
              </div>
              {/* Contratos */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Contratos</p>
                <div className="space-y-2">
                  {selected.contracts.map(c => (
                    <div key={c.id} className="border border-slate-200 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium text-slate-800 leading-snug">{c.property}</p>
                        <Badge status={c.status}/>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Venc. dia {c.dueDay} · Término {fmtDate(c.end)}</span>
                        <span className="font-semibold text-slate-700">{fmt(c.totalValue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
