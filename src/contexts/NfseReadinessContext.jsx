import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Campos mínimos para emissão de NFS-e (baseado em nfse-emitir.js)
export const NFSE_CHECKS = [
  { field: 'company_name',        label: 'Razão Social',              tab: 'empresa' },
  { field: 'cnpj',                label: 'CNPJ / CPF',                tab: 'empresa' },
  { field: 'inscricao_municipal', label: 'Inscrição Municipal',       tab: 'empresa' },
  // Certificado: campo especial — checado separadamente via certOk
  { field: '__cert',              label: 'Certificado Digital A1',    tab: 'empresa' },
  { field: 'nfse_municipio_ibge', label: 'Município de prestação',   tab: 'fiscal'  },
  { field: 'nfse_codigo_servico', label: 'Código de serviço LC 116', tab: 'fiscal'  },
  { field: 'aliquota_iss',        label: 'Alíquota ISS',             tab: 'fiscal'  },
  { field: 'nfse_logradouro',     label: 'Logradouro do prestador',  tab: 'fiscal'  },
  { field: 'nfse_cep',            label: 'CEP do prestador',         tab: 'fiscal'  },
  { field: 'from_name',           label: 'Nome remetente (e-mail)',  tab: 'email'   },
  { field: 'from_email',          label: 'E-mail remetente',         tab: 'email'   },
]

const NfseReadinessContext = createContext({ missing: [], ready: false, refresh: () => {} })

export function NfseReadinessProvider({ children }) {
  const { user } = useAuth()
  const [missing, setMissing] = useState([])
  const [ready, setReady]     = useState(false)

  const refresh = useCallback(async () => {
    if (!user) { setMissing([]); setReady(false); return }

    const { data } = await supabase
      .from('profiles')
      .select('company_name, cnpj, inscricao_municipal, nfse_cert_path, nfse_cert_password_enc, nfse_municipio_ibge, nfse_codigo_servico, aliquota_iss, nfse_logradouro, nfse_cep, from_name, from_email')
      .eq('id', user.id)
      .maybeSingle()

    if (!data) { setMissing([]); setReady(false); return }

    const certOk = !!(data.nfse_cert_path && data.nfse_cert_password_enc)

    const gaps = NFSE_CHECKS.filter(c => {
      if (c.field === '__cert') return !certOk
      return !data[c.field]
    })

    setMissing(gaps)
    setReady(gaps.length === 0)
  }, [user])

  // Verificar ao carregar e quando o usuário muda
  useEffect(() => { refresh() }, [refresh])

  return (
    <NfseReadinessContext.Provider value={{ missing, ready, refresh }}>
      {children}
    </NfseReadinessContext.Provider>
  )
}

export function useNfseReadiness() {
  return useContext(NfseReadinessContext)
}
