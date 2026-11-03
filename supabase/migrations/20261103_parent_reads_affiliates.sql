-- Migration: permite que o usuário pai (contabilidade) leia e escreva
-- nos dados dos seus afiliados (contratos e cobrancas).
--
-- CONTEXTO: profiles.parent_user_id aponta para o pai.
-- A função auth_user_parent_id() (criada em 20261030) vai na direção inversa
-- (filho → pai). Aqui precisamos da direção pai → filhos.
--
-- ESTRATÉGIA: função SECURITY DEFINER que retorna true se auth.uid()
-- é o parent_user_id do user_id alvo — evita recursão de RLS.

-- 1. Função: o usuário logado é pai do user_id passado?
CREATE OR REPLACE FUNCTION public.auth_user_is_parent_of(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = target_user_id
      AND parent_user_id = auth.uid()
  );
$$;

-- 2. Políticas em contratos
-- O pai pode SELECT nos contratos dos afiliados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contratos'
      AND policyname = 'parent_reads_affiliate_contratos'
  ) THEN
    CREATE POLICY parent_reads_affiliate_contratos ON contratos
    FOR SELECT
    USING (
      user_id = auth.uid()
      OR public.auth_user_is_parent_of(user_id)
    );
  END IF;
END$$;

-- 3. Políticas em cobrancas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cobrancas'
      AND policyname = 'parent_reads_affiliate_cobrancas'
  ) THEN
    CREATE POLICY parent_reads_affiliate_cobrancas ON cobrancas
    FOR SELECT
    USING (
      user_id = auth.uid()
      OR public.auth_user_is_parent_of(user_id)
    );
  END IF;
END$$;

-- Pai também pode UPDATE em cobrancas dos afiliados
-- (necessário para atualizar status após emissão)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cobrancas'
      AND policyname = 'parent_updates_affiliate_cobrancas'
  ) THEN
    CREATE POLICY parent_updates_affiliate_cobrancas ON cobrancas
    FOR UPDATE
    USING (
      user_id = auth.uid()
      OR public.auth_user_is_parent_of(user_id)
    );
  END IF;
END$$;

-- 4. Pai pode ler profiles dos afiliados (para montar o dropdown)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'parent_reads_affiliate_profiles'
  ) THEN
    CREATE POLICY parent_reads_affiliate_profiles ON profiles
    FOR SELECT
    USING (
      id = auth.uid()
      OR id = public.auth_user_parent_id()                  -- afiliado lê seu pai (policy anterior)
      OR public.auth_user_is_parent_of(id)                  -- pai lê seus afiliados
    );
  END IF;
END$$;

-- 5. Pai pode ler inquilinos dos afiliados (nome aparece na coluna Cliente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inquilinos'
      AND policyname = 'parent_reads_affiliate_inquilinos'
  ) THEN
    CREATE POLICY parent_reads_affiliate_inquilinos ON inquilinos
    FOR SELECT
    USING (
      user_id = auth.uid()
      OR public.auth_user_is_parent_of(user_id)
    );
  END IF;
END$$;

-- 6. Pai pode ler nfse_emissoes dos afiliados (status das notas na listagem)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nfse_emissoes'
      AND policyname = 'parent_reads_affiliate_nfse_emissoes'
  ) THEN
    CREATE POLICY parent_reads_affiliate_nfse_emissoes ON nfse_emissoes
    FOR SELECT
    USING (
      user_id = auth.uid()
      OR public.auth_user_is_parent_of(user_id)
    );
  END IF;
END$$;
