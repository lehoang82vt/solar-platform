-- F-27 hotfix: quotes.price_total (column) + contracts.status UPPERCASE
-- Idempotent: safe to run multiple times

-- quotes.price_total for contract_value (no payload)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS price_total numeric;

-- contracts: default and existing rows to UPPERCASE (DRAFT,SIGNED,INSTALLING,HANDOVER,COMPLETED,CANCELLED)
ALTER TABLE contracts ALTER COLUMN status SET DEFAULT 'DRAFT';
UPDATE contracts
SET status = CASE LOWER(TRIM(COALESCE(status, '')))
  WHEN 'draft' THEN 'DRAFT'
  WHEN 'signed' THEN 'SIGNED'
  WHEN 'installing' THEN 'INSTALLING'
  WHEN 'handover' THEN 'HANDOVER'
  WHEN 'complete' THEN 'COMPLETED'
  WHEN 'cancelled' THEN 'CANCELLED'
  ELSE COALESCE(UPPER(status), 'DRAFT')
END
WHERE status IS NOT NULL;

SELECT '009: quotes.price_total added, contracts.status normalized to UPPERCASE' AS status;
