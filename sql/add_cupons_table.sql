-- Tabela de cupons de desconto para assinatura NotaFacil
-- Execute no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS cupons (
  id           UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo       TEXT          UNIQUE NOT NULL,
  valor_mensal NUMERIC(10,2) NOT NULL,
  ativo        BOOLEAN       DEFAULT TRUE,
  usos         INTEGER       DEFAULT 0,
  created_at   TIMESTAMPTZ   DEFAULT NOW()
);

-- RLS: apenas usuários autenticados (admin logado) pode gerenciar
ALTER TABLE cupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage cupons"
  ON cupons FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Índice para busca por código (case-insensitive)
CREATE INDEX IF NOT EXISTS cupons_codigo_idx ON cupons (UPPER(codigo));
