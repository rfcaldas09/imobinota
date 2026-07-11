import { useEffect, useState } from 'react'

function Toast({ msg, type, onDone }) {
  const [out, setOut] = useState(false)
  useEffect(() => {
    const t1 = setTimeout(() => setOut(true), 2600)
    const t2 = setTimeout(() => onDone(), 3000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])
  const colors = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-indigo-600' }
  return (
    <div className={`${colors[type] ?? colors.info} text-white text-sm px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 max-w-xs transition-all duration-300 ${out ? 'opacity-0 translate-y-2' : 'opacity-100'}`}>
      {msg}
    </div>
  )
}

export default function ToastContainer({ toasts, remove }) {
  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[100]">
      {toasts.map(t => (
        <Toast key={t.id} msg={t.msg} type={t.type} onDone={() => remove(t.id)} />
      ))}
    </div>
  )
}
