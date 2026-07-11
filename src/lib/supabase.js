import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

if (!supabaseConfigured) {
  console.warn('⚠️ [DEV] Supabase não configurado — rodando em modo mock. Configure .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para conectar ao banco real.')
}
