import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { IcHome, IcFile, IcDollar, IcTrend, IcSettings, IcUsers, IcLogout } from './Icons'

const LOGO_URL = '/logo-imobinota.png' // coloque a logo em public/

const NAV = [
  { to: '/',          label: 'Dashboard',  Icon: IcHome },
  { to: '/contratos', label: 'Contratos',  Icon: IcFile },
  { to: '/cobrancas', label: 'Cobranças',  Icon: IcDollar },
  { to: '/relatorios',label: 'Relatórios', Icon: IcTrend },
  { to: '/inquilinos',label: 'Inquilinos', Icon: IcUsers },
  { to: '/config',    label: 'Configurações', Icon: IcSettings },
]

export default function Sidebar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

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
            end={to === '/'}
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
            <button
              disabled
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-400 cursor-not-allowed"
            >
              Minha conta
              <span className="ml-auto text-xs bg-slate-100 px-1.5 py-0.5 rounded">Em breve</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <IcLogout c="w-4 h-4" /> Sair
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
