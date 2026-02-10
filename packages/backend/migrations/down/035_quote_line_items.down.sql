REVOKE SELECT, INSERT, UPDATE, DELETE ON quote_line_items FROM app_user;
DROP POLICY IF EXISTS quote_line_items_insert_policy ON quote_line_items;
DROP POLICY IF EXISTS quote_line_items_isolation ON quote_line_items;
ALTER TABLE quote_line_items DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS quote_line_items;
