-- BI-01: Materialized views for BI (pipeline, P&L, funnel velocity, product, salesperson)
-- Refresh: CONCURRENTLY for production; cron every 1 hour; manual API.
-- Requires: projects, quotes, contracts, leads, quote_line_items, system_configs, users

-- 1. mv_sales_pipeline: Projects by stage, counts, conversion context
DROP MATERIALIZED VIEW IF EXISTS mv_sales_pipeline CASCADE;
CREATE MATERIALIZED VIEW mv_sales_pipeline AS
SELECT
  p.organization_id,
  p.status AS stage,
  COUNT(*) AS project_count,
  COUNT(*) FILTER (WHERE q.id IS NOT NULL) AS quoted_count,
  COUNT(*) FILTER (WHERE c.id IS NOT NULL) AS contracted_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE q.id IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) AS quote_rate_pct,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE c.id IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) AS contract_rate_pct
FROM projects p
LEFT JOIN LATERAL (
  SELECT id FROM quotes q2 WHERE q2.project_id = p.id LIMIT 1
) q ON true
LEFT JOIN LATERAL (
  SELECT id FROM contracts c2 WHERE c2.project_id = p.id LIMIT 1
) c ON true
GROUP BY p.organization_id, p.status;

CREATE UNIQUE INDEX idx_mv_sales_pipeline_org_stage
  ON mv_sales_pipeline (organization_id, stage);

-- 2. mv_profit_loss: Revenue (contract total_vnd) by month; cost/margin placeholder
DROP MATERIALIZED VIEW IF EXISTS mv_profit_loss CASCADE;
CREATE MATERIALIZED VIEW mv_profit_loss AS
SELECT
  c.organization_id,
  date_trunc('month', c.created_at)::date AS month,
  COALESCE(SUM(c.total_vnd), 0)::bigint AS revenue_vnd,
  COALESCE(SUM(c.deposit_vnd), 0)::bigint AS deposit_vnd,
  COUNT(*) AS contract_count,
  0::bigint AS cost_vnd,
  COALESCE(SUM(c.total_vnd), 0)::bigint AS margin_vnd
FROM contracts c
WHERE c.total_vnd IS NOT NULL
GROUP BY c.organization_id, date_trunc('month', c.created_at);

CREATE UNIQUE INDEX idx_mv_profit_loss_org_month
  ON mv_profit_loss (organization_id, month);

-- 3. mv_funnel_velocity: Lead → Contract time metrics (days)
DROP MATERIALIZED VIEW IF EXISTS mv_funnel_velocity CASCADE;
CREATE MATERIALIZED VIEW mv_funnel_velocity AS
SELECT
  p.organization_id,
  l.id AS lead_id,
  p.id AS project_id,
  l.created_at AS lead_at,
  p.created_at AS project_at,
  p.contacted_at,
  p.surveyed_at,
  p.quoted_at,
  p.contracted_at,
  p.completed_at,
  EXTRACT(DAY FROM (p.created_at - l.created_at))::int AS lead_to_project_days,
  EXTRACT(DAY FROM (p.quoted_at - l.created_at))::int AS lead_to_quote_days,
  EXTRACT(DAY FROM (p.contracted_at - l.created_at))::int AS lead_to_contract_days,
  EXTRACT(DAY FROM (p.completed_at - l.created_at))::int AS lead_to_completed_days
FROM leads l
JOIN projects p ON p.lead_id = l.id;

CREATE UNIQUE INDEX idx_mv_funnel_velocity_project
  ON mv_funnel_velocity (organization_id, project_id);

-- 4. mv_product_performance: Top modules/inverters/batteries (from quote line items)
DROP MATERIALIZED VIEW IF EXISTS mv_product_performance CASCADE;
CREATE MATERIALIZED VIEW mv_product_performance AS
SELECT
  qli.organization_id,
  qli.item_type AS product_type,
  qli.catalog_item_id,
  COUNT(*) AS units_sold,
  COALESCE(SUM(qli.total_price_vnd), 0)::bigint AS revenue_vnd,
  COALESCE(SUM(qli.quantity), 0)::numeric(14,2) AS quantity_sold
FROM quote_line_items qli
WHERE qli.catalog_item_id IS NOT NULL
GROUP BY qli.organization_id, qli.item_type, qli.catalog_item_id;

CREATE UNIQUE INDEX idx_mv_product_performance_org_type_id
  ON mv_product_performance (organization_id, product_type, catalog_item_id);

-- 5. mv_salesperson_metrics: Performance by assigned_to (sales rep)
DROP MATERIALIZED VIEW IF EXISTS mv_salesperson_metrics CASCADE;
CREATE MATERIALIZED VIEW mv_salesperson_metrics AS
SELECT
  p.organization_id,
  p.assigned_to AS user_id,
  u.full_name AS salesperson_name,
  COUNT(DISTINCT p.id) AS project_count,
  COUNT(DISTINCT q.id) AS quote_count,
  COUNT(DISTINCT c.id) AS contract_count,
  COALESCE(SUM(c.total_vnd) FILTER (WHERE c.id IS NOT NULL), 0)::bigint AS revenue_vnd
FROM projects p
LEFT JOIN users u ON u.id = p.assigned_to AND u.organization_id = p.organization_id
LEFT JOIN quotes q ON q.project_id = p.id
LEFT JOIN contracts c ON c.project_id = p.id
GROUP BY p.organization_id, p.assigned_to, u.full_name;

CREATE UNIQUE INDEX idx_mv_salesperson_metrics_org_user
  ON mv_salesperson_metrics (organization_id, user_id);

-- Initial refresh (non-concurrent)
REFRESH MATERIALIZED VIEW mv_sales_pipeline;
REFRESH MATERIALIZED VIEW mv_profit_loss;
REFRESH MATERIALIZED VIEW mv_funnel_velocity;
REFRESH MATERIALIZED VIEW mv_product_performance;
REFRESH MATERIALIZED VIEW mv_salesperson_metrics;

-- Allow app_user to read (and optionally refresh if migration runs as postgres and owner is postgres)
GRANT SELECT ON mv_sales_pipeline TO app_user;
GRANT SELECT ON mv_profit_loss TO app_user;
GRANT SELECT ON mv_funnel_velocity TO app_user;
GRANT SELECT ON mv_product_performance TO app_user;
GRANT SELECT ON mv_salesperson_metrics TO app_user;

SELECT 'BI-01: 5 materialized views created and refreshed' AS status;
