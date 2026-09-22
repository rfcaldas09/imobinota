-- ============================================================
-- Ajustar data de vencimento do plano PRO
-- Usuário: VIVABEMASSISTENCIAS@GMAIL.COM
-- Nova data de vencimento: 25/09/2026
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Ver situação atual antes de alterar
SELECT
  au.email,
  p.plano_tipo,
  p.plano_fim,
  (p.plano_fim - current_date) AS dias_restantes
FROM auth.users au
JOIN profiles p ON p.id = au.id
WHERE lower(au.email) = 'vivabemassistencias@gmail.com';

-- ============================================================
-- 2. Atualizar a data de vencimento para 25/09/2026
--    (rode após confirmar os dados no passo 1)
-- ============================================================

UPDATE profiles
SET plano_fim = '2026-09-25'
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE lower(email) = 'vivabemassistencias@gmail.com'
  LIMIT 1
);

-- 3. Confirmar resultado
SELECT
  au.email,
  p.plano_tipo,
  p.plano_fim,
  (p.plano_fim - current_date) AS dias_restantes
FROM auth.users au
JOIN profiles p ON p.id = au.id
WHERE lower(au.email) = 'vivabemassistencias@gmail.com';
