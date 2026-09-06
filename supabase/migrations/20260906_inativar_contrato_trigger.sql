-- Trigger: ao inativar um contrato, remove cobranças futuras ainda pendentes
-- "futuro" = mes_referencia > início do mês corrente
-- Só remove status = 'Pendente' (cobranças pagas ou emitidas são preservadas)

CREATE OR REPLACE FUNCTION fn_limpar_cobrancas_futuras()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  mes_corrente date := date_trunc('month', now())::date;
BEGIN
  -- Age apenas quando status muda de qualquer valor para 'Inativo'
  IF NEW.status = 'Inativo' AND (OLD.status IS DISTINCT FROM 'Inativo') THEN
    DELETE FROM cobrancas
    WHERE contrato_id  = NEW.id
      AND mes_referencia > mes_corrente
      AND status         = 'Pendente';
  END IF;
  RETURN NEW;
END;
$$;

-- Remove trigger anterior se existir (idempotente)
DROP TRIGGER IF EXISTS tg_inativar_contrato ON contratos;

CREATE TRIGGER tg_inativar_contrato
  AFTER UPDATE OF status ON contratos
  FOR EACH ROW
  EXECUTE FUNCTION fn_limpar_cobrancas_futuras();
