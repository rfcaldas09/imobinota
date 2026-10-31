-- Migration: permite que afiliados leiam plano_tipo e plano_fim do perfil pai
--
-- PROBLEMA: O RLS padrão de profiles só permite auth.uid() = id.
-- Afiliados que tentam ler o plano do pai recebem null, caindo no branch de
-- trial expirado e ficando sem acesso mesmo que o pai tenha plano ativo.
--
-- SOLUÇÃO: função SECURITY DEFINER para buscar parent_user_id sem recursão
-- + política adicional que usa essa função.
-- As políticas RLS são avaliadas em OR, então a nova se soma à existente.

-- 1. Função auxiliar para obter o parent_user_id do usuário logado
--    SECURITY DEFINER: executa com privilégios do definidor (service role),
--    evitando recursão de RLS ao consultar profiles dentro de uma policy de profiles.
CREATE OR REPLACE FUNCTION public.auth_user_parent_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT parent_user_id
  FROM profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- 2. Política: afiliado pode ler o profile do seu pai (somente SELECT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'affiliate_reads_parent_plan'
  ) THEN
    CREATE POLICY affiliate_reads_parent_plan ON profiles
    FOR SELECT
    USING (
      id = public.auth_user_parent_id()
    );
  END IF;
END$$;
