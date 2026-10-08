-- Suporte ao provedor Focus NFe para municípios que não usam o Emissor Nacional (SEFIN)
-- Ex: São José/SC (IBGE 4216602) usa sistema municipal próprio integrado via Focus NFe

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nfse_provedor      text    NOT NULL DEFAULT 'sefin',
  ADD COLUMN IF NOT EXISTS focus_token        text,
  ADD COLUMN IF NOT EXISTS focus_homologacao  boolean NOT NULL DEFAULT false;

-- nfse_provedor: 'sefin' (padrão — Emissor Nacional) | 'focus' (Focus NFe)
-- focus_token:   token de autenticação da API Focus NFe (por usuário)
-- focus_homologacao: true = ambiente de homologação (sandbox), false = produção

COMMENT ON COLUMN profiles.nfse_provedor     IS 'Provedor de emissão NFS-e: sefin (padrão nacional) | focus (Focus NFe para municípios com sistema próprio)';
COMMENT ON COLUMN profiles.focus_token       IS 'Token de autenticação da API Focus NFe — confidencial, salvo direto no perfil do usuário';
COMMENT ON COLUMN profiles.focus_homologacao IS 'Quando true, usa o ambiente de homologação (sandbox) da Focus NFe';
