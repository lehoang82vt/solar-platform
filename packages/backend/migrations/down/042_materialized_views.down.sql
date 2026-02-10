-- BI-01: Drop materialized views
DROP MATERIALIZED VIEW IF EXISTS mv_salesperson_metrics;
DROP MATERIALIZED VIEW IF EXISTS mv_product_performance;
DROP MATERIALIZED VIEW IF EXISTS mv_funnel_velocity;
DROP MATERIALIZED VIEW IF EXISTS mv_profit_loss;
DROP MATERIALIZED VIEW IF EXISTS mv_sales_pipeline;

SELECT '042 Rollback: materialized views dropped' AS status;
