-- Focus NFe — colunas para o fluxo de cadastro automático de empresa
-- O certificado A1 (base64) NÃO é armazenado por segurança — apenas usado na chamada à API
-- login/senha da prefeitura SÃO armazenados (necessários para reenvio/atualização)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS focus_login_prefeitura text,
  ADD COLUMN IF NOT EXISTS focus_senha_prefeitura text,
  ADD COLUMN IF NOT EXISTS focus_sync_at          timestamptz,
  ADD COLUMN IF NOT EXISTS focus_token_prod       text;   -- token de produção (separado do de homo)

COMMENT ON COLUMN profiles.focus_login_prefeitura IS 'Login da prefeitura para NFS-e em municípios que usam autenticação própria (ex: São José/SC)';
COMMENT ON COLUMN profiles.focus_senha_prefeitura IS 'Senha da prefeitura para NFS-e — confidencial';
COMMENT ON COLUMN profiles.focus_sync_at          IS 'Timestamp do último cadastro/atualização de empresa no Focus NFe';
COMMENT ON COLUMN profiles.focus_token_prod       IS 'Token de produção retornado pelo Focus NFe após cadastro da empresa';
