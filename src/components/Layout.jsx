import Sidebar from './Sidebar'
import NfseAlertBanner from './NfseAlertBanner'
import { NfseReadinessProvider } from '../contexts/NfseReadinessContext'

export default function Layout({ children }) {
  return (
    <NfseReadinessProvider>
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <NfseAlertBanner />
          {children}
        </main>
      </div>
    </NfseReadinessProvider>
  )
}
