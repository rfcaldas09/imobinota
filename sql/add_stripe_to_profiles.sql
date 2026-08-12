-- Adiciona colunas Stripe na tabela profiles
-- Execute no Supabase SQL Editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT DEFAULT NULL;

-- Índice para lookup por customer_id no webhook
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
