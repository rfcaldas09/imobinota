-- Discriminação do serviço por contrato
-- discriminacao_servico: texto fixo que vai na NFS-e (opcional)
-- solicitar_discriminacao_mensal: quando true, o sistema pede o texto antes de cada emissão

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS discriminacao_servico          TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS solicitar_discriminacao_mensal BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN contratos.discriminacao_servico          IS 'Texto fixo para o campo Discriminação do Serviço na NFS-e. Quando preenchido, sobrepõe a descrição do código LC 116.';
COMMENT ON COLUMN contratos.solicitar_discriminacao_mensal IS 'Quando true, o sistema solicita o texto de discriminação antes de cada emissão (útil para contratos com número de ordem de compra mensal).';

-- Guarda a discriminação que foi enviada na NFS-e (para exibir corretamente no PDF)
ALTER TABLE nfse_emissoes
  ADD COLUMN IF NOT EXISTS discriminacao_servico TEXT DEFAULT NULL;

COMMENT ON COLUMN nfse_emissoes.discriminacao_servico IS 'Texto de discriminação enviado nesta emissão (texto livre ou texto fixo do contrato).';
