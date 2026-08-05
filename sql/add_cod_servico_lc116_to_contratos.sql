-- Adiciona campo de código de serviço LC 116 por contrato
-- Permite sobrepor o código padrão configurado em Configurações → Fiscal
-- Ex: médico pode emitir como "4.01 Medicina" num contrato e "4.02 Análises Clínicas" em outro
ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS cod_servico_lc116 TEXT DEFAULT NULL;

COMMENT ON COLUMN contratos.cod_servico_lc116
  IS 'Código de serviço LC 116/2003 específico para este contrato (ex: ''4.01'', ''10.09''). '
     'Se preenchido, sobrepõe o código padrão do perfil (nfse_codigo_servico) na emissão de NFS-e.';
