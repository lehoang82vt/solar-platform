DROP POLICY IF EXISTS partner_commissions_insert_policy ON partner_commissions;
DROP POLICY IF EXISTS partner_commissions_isolation ON partner_commissions;
ALTER TABLE partner_commissions DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS partner_commissions CASCADE;
