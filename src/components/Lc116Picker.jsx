import { useState, useEffect, useRef } from 'react'
import { LC116 } from '../lib/lc116'

// Dropdown pesquisável de código de serviço LC 116
// Props:
//   value    — string cod selecionado (ou '' para nenhum)
//   onChange — fn(cod: string) chamada ao selecionar/limpar
//   label    — string opcional; padrão mostra o hint de "sobrepõe o cadastro"
export default function Lc116Picker({ value, onChange, label }) {
  const [search, setSearch] = useState('')
  const [open, setOpen]     = useState(false)
  const ref                 = useRef(null)

  const selected = LC116.find(s => s.cod === value)
  const filtered = search.trim()
    ? LC116.filter(s =>
        s.cod.includes(search.trim()) ||
        s.desc.toLowerCase().includes(search.trim().toLowerCase())
      )
    : LC116

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref}>
      {label !== false && (
        <label className="text-xs font-medium text-slate-500 block mb-1">
          {label ?? (
            <>Código serviço LC 116 <span className="text-slate-300 font-normal">(opcional — sobrepõe o padrão do cadastro fiscal)</span></>
          )}
        </label>
      )}
      <div className="relative">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
            {selected ? `${selected.cod} — ${selected.desc}` : '— Usar padrão do cadastro —'}
          </span>
          <span className="text-slate-400 ml-2">▾</span>
        </button>
        {open && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 border-b border-slate-100 flex gap-2">
              <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Código (ex: 4.01) ou descrição…"
                className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
              {value && (
                <button type="button" onClick={() => { onChange(''); setSearch(''); setOpen(false) }}
                  className="text-xs text-slate-400 hover:text-slate-600 px-2">
                  limpar
                </button>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">Nenhum resultado</p>
              )}
              {filtered.map(s => (
                <button key={s.cod} type="button"
                  onClick={() => { onChange(s.cod); setSearch(''); setOpen(false) }}
                  className={'w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ' +
                    (s.cod === value ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700')}>
                  <span className="font-mono text-xs text-slate-500 mr-2">{s.cod}</span>
                  {s.desc}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
