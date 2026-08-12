import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useSubscription, TRIAL_DAYS } from '../contexts/SubscriptionContext'
import { IcHome, IcFile, IcDollar, IcTrend, IcSettings, IcUsers, IcLogout, IcReceipt } from './Icons'

const LOGO_URL = '/logo-notafacil.png'

const fmtDate = d => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const NAV = [
  { to: '/dashboard',  label: 'Dashboard',     Icon: IcHome },
  { to: '/contratos',  label: 'Contratos Recorrentes', Icon: IcFile },
  { to: '/cobrancas',    label: 'Cobranças',      Icon: IcDollar },
  { to: '/nfse-avulsa', label: 'NFS-e Avulsa',  Icon: IcReceipt },
  { to: '/relatorios',  label: 'Relatórios',     Icon: IcTrend },
  { to: '/inquilinos', label: 'Clientes',      Icon: IcUsers },
  { to: '/config',     label: 'Configurações', Icon: IcSettings },
]

export default function Sidebar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const sub = useSubscription()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleLogout = async () => {
    await signOut()
    navigate('/')
  }

  // Widget de plano — derivado do SubscriptionContext
  const planName = sub?.isTrial
    ? 'Experimentação'
    : sub?.plan === 'pro'
    ? 'Pro'
    : sub?.plan === 'essencial'
    ? 'Essencial'
    : 'Sem plano ativo'

  const endDate   = sub?.isTrial ? sub?.trialEnd : sub?.planoFim
  const totalDays = sub?.isTrial ? TRIAL_DAYS : 30
  const remaining = sub?.daysLeft ?? 0
  const pct       = Math.min(100, Math.round((remaining / totalDays) * 100))
  const urgent    = remaining <= 1
  const warn      = remaining <= 3

  const widgetColor = urgent
    ? 'bg-red-50 border-red-200 hover:bg-red-100'
    : warn
    ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
    : 'bg-indigo-50 border-indigo-100 hover:bg-indigo-100'

  const badgeColor = urgent
    ? 'bg-red-200 text-red-700'
    : warn
    ? 'bg-amber-200 text-amber-700'
    : 'bg-indigo-200 text-indigo-700'

  const barColor = urgent ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-indigo-500'
  const textColor = urgent ? 'text-red-600' : warn ? 'text-amber-600' : 'text-indigo-500'

  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col h-screen">

      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-100 flex items-center justify-center">
        <img src={LOGO_URL} alt="NotaFacil" className="h-12 w-auto" style={{ maxHeight: 48 }} />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ' +
              (isActive
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800')
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
          className={'w-full rounded-xl p-3 text-left transition-all border ' + widgetColor}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-600 truncate">{planName}</span>
            <span className={'text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1 ' + badgeColor}>
              {remaining}d
            </span>
          </div>
          <div className="h-1.5 bg-white/70 rounded-full overflow-hidden mb-1">
            <div className={'h-full rounded-full transition-all ' + barColor} style={{ width: pct + '%' }} />
          </div>
          <p className={'text-[10px] ' + textColor}>
            {urgent ? '⚠️ Renove em breve!' : 'Encerra em ' + fmtDate(endDate)}
          </p>
        </button>
      </div>

      {/* Suporte WhatsApp */}
      <div className="px-3 pb-2">
        <a
          href="https://wa.me/5547992454907?text=Preciso%20de%20ajuda%20com%20o%20software%20NotaFacil"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 flex-shrink-0">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.523 5.847L.057 23.882a.5.5 0 0 0 .613.613l6.035-1.466A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.667-.523-5.183-1.433l-.371-.22-3.844.934.951-3.741-.241-.386A9.943 9.943 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
          </svg>
          Suporte via WhatsApp
        </a>
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
