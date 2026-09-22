-- Adiciona suporte a usuários afiliados (guarda-chuva / revenda)
-- parent_user_id: quando preenchido, este usuário é afiliado do pai
--   - herda status do plano do pai (ativo/expirado)
--   - não vê a tela /plano
--   - não paga diretamente ao notafacilapp
-- Usuários existentes: parent_user_id = NULL (sem impacto algum)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS parent_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Índice para lookup eficiente (SubscriptionContext busca o pai pelo id)
CREATE INDEX IF NOT EXISTS idx_profiles_parent_user_id ON profiles(parent_user_id)
  WHERE parent_user_id IS NOT NULL;

-- Política RLS: afiliado pode ler o plano do seu pai
-- (necessário para o SubscriptionContext buscar plano_tipo/plano_fim do parent)
CREATE POLICY IF NOT EXISTS "Afiliado pode ler plano do pai"
  ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR id IN (
      SELECT parent_user_id FROM profiles WHERE id = auth.uid() AND parent_user_id IS NOT NULL
    )
  );
