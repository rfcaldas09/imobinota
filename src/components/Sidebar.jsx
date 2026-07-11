import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { IcHome, IcFile, IcDollar, IcTrend, IcSettings, IcUsers, IcLogout } from './Icons'

const LOGO_URL = '/logo-imobinota.png'

// Dados do plano (mock — virão do Supabase em produção)
const PLAN = {
  name: 'ImobiNota Essencial',
  renewDate: '18/07/2026',
  totalDays: 30,
  usedDays: 19,
}

const NAV = [
  { to: '/dashboard',  label: 'Dashboard',     Icon: IcHome },
  { to: '/contratos',  label: 'Contratos',     Icon: IcFile },
  { to: '/cobrancas',  label: 'Cobranças',     Icon: IcDollar },
  { to: '/relatorios', label: 'Relatórios',    Icon: IcTrend },
  { to: '/inquilinos', label: 'Inquilinos',    Icon: IcUsers },
  { to: '/config',     label: 'Configurações', Icon: IcSettings },
]

export default function Sidebar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleLogout = async () => {
    await signOut()
    navigate('/')
  }

  const remaining = PLAN.totalDays - PLAN.usedDays
  const pct       = Math.round(PLAN.usedDays / PLAN.totalDays * 100)
  const urgent    = remaining <= 5
  const warn      = remaining <= 10

  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col h-screen">
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-100">
        <img src={LOGO_URL} alt="ImobiNota" className="h-9 w-auto" style={{ maxHeight: 36 }} />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              `w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`
            }
          >
            <Icon c="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Licença */}
      <div className="px-3 pb-2">
        <button onClick={() => navigate('/plano')}
          className={`w-full rounded-xl p-3 text-left transition-all border ${
            urgent ? 'bg-red-50 border-red-200 hover:bg-red-100'
            : warn ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
            : 'bg-indigo-50 border-indigo-100 hover:bg-indigo-100'
          }`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-600 truncate">{PLAN.name}</span>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1 ${
              urgent ? 'bg-red-200 text-red-700'
              : warn ? 'bg-amber-200 text-amber-700'
              : 'bg-indigo-200 text-indigo-700'
            }`}>{remaining}d</span>
          </div>
          <div className="h-1.5 bg-white/70 rounded-full overflow-hidden mb-1">
            <div className={`h-full rounded-full transition-all ${
              urgent ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-indigo-500'
            }`} style={{ width: `${pct}%` }}/>
          </div>
          <p className={`text-[10px] ${urgent ? 'text-red-600' : warn ? 'text-amber-600' : 'text-indigo-500'}`}>
            {urgent ? '⚠️ Renove em breve!' : `Renova em ${PLAN.renewDate}`}
          </p>
        </button>
      </div>

      {/* User section */}
      <div className="border-t border-slate-100 p-3 relative">
        <button
          onClick={() => setShowUserMenu(p => !p)}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.email?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">
              {user?.user_metadata?.company_name ?? user?.email}
            </p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
        </button>

        {showUserMenu && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
            <button onClick={() => { navigate('/plano'); setShowUserMenu(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
              🏷️ Meu Plano
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-slate-100"
            >
              <IcLogout c="w-4 h-4" /> Sair
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
