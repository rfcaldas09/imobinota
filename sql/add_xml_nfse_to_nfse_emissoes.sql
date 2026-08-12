-- Armazena o XML da NFS-e retornado pelo SEFIN após emissão bem-sucedida
-- Usado por nfse-pdf.js para gerar o PDF da nota fiscal

ALTER TABLE nfse_emissoes
  ADD COLUMN IF NOT EXISTS xml_nfse TEXT DEFAULT NULL;

COMMENT ON COLUMN nfse_emissoes.xml_nfse IS 'XML completo da NFS-e retornado pelo SEFIN (usado para geração de PDF).';
