-- Migração: Aceite de Termos de Uso
-- Executa no Supabase SQL Editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS termos_aceite_at    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS termos_aceite_texto TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS termos_versao       TEXT        DEFAULT NULL;

-- Índice para facilitar consultas de auditoria (usuários que aceitaram)
CREATE INDEX IF NOT EXISTS idx_profiles_termos_aceite_at
  ON profiles (termos_aceite_at)
  WHERE termos_aceite_at IS NOT NULL;

-- Comentários de documentação
COMMENT ON COLUMN profiles.termos_aceite_at    IS 'Data/hora UTC em que o usuário aceitou os termos de uso';
COMMENT ON COLUMN profiles.termos_aceite_texto IS 'Texto integral dos termos aceitos (snapshot para auditoria)';
COMMENT ON COLUMN profiles.termos_versao       IS 'Versão dos termos aceitos (ex: 1.0)';
