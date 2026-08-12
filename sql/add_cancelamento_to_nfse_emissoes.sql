-- Adiciona campos de cancelamento à tabela nfse_emissoes
-- Execute no Supabase SQL Editor

ALTER TABLE nfse_emissoes
  ADD COLUMN IF NOT EXISTS cancelado_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;

-- Atualiza o status para 'cancelada' será feito via UPDATE do backend
-- (o campo status TEXT já existe na tabela)

COMMENT ON COLUMN nfse_emissoes.cancelado_em        IS 'Data/hora do cancelamento confirmado pelo SEFIN';
COMMENT ON COLUMN nfse_emissoes.motivo_cancelamento IS 'Código do motivo de cancelamento: 1=emitida com erro, 2=serviço não prestado, 3=duplicidade';
