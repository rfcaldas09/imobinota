import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useNfseReadiness, NFSE_CHECKS } from '../contexts/NfseReadinessContext'

// Ícone de aviso SVG inline
function IcWarning() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}

function IcChevron({ open }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

const TAB_LABELS = {
  empresa: 'Empresa',
  fiscal:  'Fiscal / NFS-e',
  email:   'E-mail',
}

export default function NfseAlertBanner() {
  const { missing, ready, refresh } = useNfseReadiness()
  const location  = useLocation()
  const navigate  = useNavigate()
  const [open, setOpen] = useState(false)

  // Re-verificar a cada navegação de rota
  useEffect(() => { refresh() }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  if (ready || missing.length === 0) return null

  // Agrupar por aba
  const byTab = {}
  missing.forEach(c => {
    const t = c.tab
    if (!byTab[t]) byTab[t] = []
    byTab[t].push(c)
  })

  const goToTab = (tab) => {
    navigate(`/config?tab=${tab}`)
  }

  return (
    <div className="px-4 pt-4">
      <div className="rounded-2xl overflow-hidden border border-amber-300 bg-amber-50 shadow-sm">

        {/* Cabeçalho — sempre visível */}
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-100/70 transition-colors"
        >
          <span className="text-amber-600"><IcWarning /></span>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-900 text-sm leading-tight">
              {missing.length} pendência{missing.length !== 1 ? 's' : ''} para emitir NFS-e
            </p>
            <p className="text-xs text-amber-700 mt-0.5 truncate">
              {missing.map(c => c.label).join(' · ')}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={e => { e.stopPropagation(); navigate('/config') }}
              className="text-xs font-semibold text-amber-800 bg-amber-200 hover:bg-amber-300 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
            >
              Configurar →
            </button>
            <span className="text-amber-600"><IcChevron open={open} /></span>
          </div>
        </button>

        {/* Detalhes expandidos */}
        {open && (
          <div className="border-t border-amber-200 px-4 py-3 space-y-3">
            {Object.entries(byTab).map(([tab, items]) => (
              <div key={tab}>
                <button
                  onClick={() => goToTab(tab)}
                  className="flex items-center gap-1.5 mb-1.5 group"
                >
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-wide group-hover:underline">
                    {TAB_LABELS[tab] || tab}
                  </span>
                  <span className="text-xs text-amber-500">→</span>
                </button>
                <div className="flex flex-wrap gap-1.5">
                  {items.map(item => (
                    <span
                      key={item.field}
                      className="inline-flex items-center gap-1 text-xs bg-white border border-amber-200 text-amber-800 px-2.5 py-1 rounded-lg"
                    >
                      <span className="text-red-400 font-bold">✕</span>
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            <p className="text-xs text-amber-600 pt-1 border-t border-amber-200">
              Preencha todos os campos em{' '}
              <button onClick={() => navigate('/config')} className="font-semibold underline">
                Configurações
              </button>{' '}
              para habilitar a emissão automática de NFS-e.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
