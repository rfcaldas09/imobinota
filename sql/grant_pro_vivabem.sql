-- ============================================================
-- Liberar assinatura PRO por 1 mês para VIVABEMASSISTENCIAS@GMAIL.COM
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Verificar se o usuário existe (rode antes para confirmar)
SELECT
  au.id,
  au.email,
  au.created_at,
  p.plano_tipo,
  p.plano_fim
FROM auth.users au
LEFT JOIN profiles p ON p.id = au.id
WHERE lower(au.email) = 'vivabemassistencias@gmail.com';

-- ============================================================
-- 2. Aplicar o plano PRO por 30 dias a partir de hoje
--    (só rode após confirmar que o usuário existe no passo 1)
-- ============================================================

UPDATE profiles
SET
  plano_tipo = 'pro',
  plano_fim  = (now() + interval '30 days')::date
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE lower(email) = 'vivabemassistencias@gmail.com'
  LIMIT 1
);

-- 3. Confirmar o resultado
SELECT
  au.email,
  p.plano_tipo,
  p.plano_fim,
  (p.plano_fim - current_date) AS dias_restantes
FROM auth.users au
JOIN profiles p ON p.id = au.id
WHERE lower(au.email) = 'vivabemassistencias@gmail.com';
