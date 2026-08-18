import { useState, useEffect, useRef } from 'react'
import { NBS_OPTIONS } from '../lib/nbs'

// Dropdown pesquisável de código NBS
// Props:
//   value    — string código selecionado (ou '' para nenhum)
//   onChange — fn(value: string) chamada ao selecionar/limpar
//   label    — string opcional
export default function NbsPicker({ value, onChange, label }) {
  const [search, setSearch] = useState('')
  const [open, setOpen]     = useState(false)
  const ref                 = useRef(null)

  const selected = NBS_OPTIONS.find(o => o.value === value)

  const filtered = search.trim().length >= 2
    ? NBS_OPTIONS.filter(o =>
        o.value.includes(search.trim()) ||
        o.label.toLowerCase().includes(search.trim().toLowerCase())
      ).slice(0, 100)
    : NBS_OPTIONS.slice(0, 100)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref}>
      <label className="text-xs font-medium text-slate-500 block mb-1">
        {label ?? 'NBS — Nomenclatura Brasileira de Serviços'}
      </label>
      <div className="relative">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-violet-400">
          <span className={selected ? 'text-slate-800 font-mono text-xs' : 'text-slate-400'}>
            {selected ? selected.label : '— Selecione o código NBS —'}
          </span>
          <span className="text-slate-400 ml-2 shrink-0">▾</span>
        </button>

        {open && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 border-b border-slate-100 flex gap-2">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Digite código (ex: 1.0901) ou descrição…"
                className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              {value && (
                <button type="button"
                  onClick={() => { onChange(''); setSearch(''); setOpen(false) }}
                  className="text-xs text-slate-400 hover:text-slate-600 px-2">
                  limpar
                </button>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">Nenhum resultado</p>
              )}
              {search.trim().length < 2 && (
                <p className="text-xs text-slate-400 text-center py-2 border-b border-slate-100">
                  Digite ao menos 2 caracteres para pesquisar nos 1.212 códigos
                </p>
              )}
              {filtered.map(o => (
                <button key={o.value} type="button"
                  onClick={() => { onChange(o.value); setSearch(''); setOpen(false) }}
                  className={'w-full text-left px-3 py-2 text-xs hover:bg-violet-50 transition-colors ' +
                    (o.value === value ? 'bg-violet-50 text-violet-700 font-semibold' : 'text-slate-700')}>
                  <span className="font-mono text-slate-500 mr-2">{o.value}</span>
                  <span>{o.label.split(' — ').slice(1).join(' — ')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
