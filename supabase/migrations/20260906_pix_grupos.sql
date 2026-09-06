-- Tabela de grupos PIX: um PIX único que paga N cobranças de garantidora
-- O correlationID enviado ao OpenPIX = 'grupo-' || id
CREATE TABLE IF NOT EXISTS pix_grupos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cobranca_ids   uuid[] NOT NULL,          -- cobranças que serão quitadas quando pago
  valor_total    numeric(12,2) NOT NULL,   -- soma dos seguro_financeiro
  status         text NOT NULL DEFAULT 'Pendente', -- Pendente | Pago
  created_at     timestamptz DEFAULT now(),
  data_pagamento timestamptz
);

-- RLS
ALTER TABLE pix_grupos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pix_grupos: dono lê e insere"
  ON pix_grupos
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role bypassa RLS automaticamente (para o webhook)
