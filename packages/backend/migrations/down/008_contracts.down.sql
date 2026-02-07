-- Rollback 008: Drop contracts and contract_number_sequences

ALTER TABLE contracts DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contracts_org_policy ON contracts;
DROP POLICY IF EXISTS contracts_insert_policy ON contracts;
DROP TABLE IF EXISTS contracts;

ALTER TABLE contract_number_sequences DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_number_sequences_org_policy ON contract_number_sequences;
DROP TABLE IF EXISTS contract_number_sequences;

SELECT '008 Rollback: contracts and contract_number_sequences dropped' AS status;
