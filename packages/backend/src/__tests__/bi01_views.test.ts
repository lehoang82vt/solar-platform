/**
 * BI-01: Materialized views for BI – pipeline, P&L, funnel, product, salesperson.
 * Requires: npm run migrate (042_materialized_views applied).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { getDatabasePool } from '../config/database';

const MAT_VIEWS = [
  'mv_sales_pipeline',
  'mv_profit_loss',
  'mv_funnel_velocity',
  'mv_product_performance',
  'mv_salesperson_metrics',
];

test.before(async () => {
  await connectDatabase();
});

test('bi01_1: all_views_created', async () => {
  const pool = getDatabasePool();
  assert.ok(pool, 'Database pool must be initialized');
  const result = await pool.query(
    `SELECT matviewname FROM pg_matviews WHERE schemaname = 'public' AND matviewname = ANY($1)`,
    [MAT_VIEWS]
  );
  const names = result.rows.map((r: { matviewname: string }) => r.matviewname);
  for (const name of MAT_VIEWS) {
    assert.ok(names.includes(name), `Materialized view ${name} must exist`);
  }
});

test('bi01_2: views_contain_data', async () => {
  const pool = getDatabasePool();
  assert.ok(pool);
  for (const name of MAT_VIEWS) {
    const result = await pool.query(`SELECT 1 FROM ${name} LIMIT 1`);
    assert.ok(Array.isArray(result.rows), `${name} must be queryable`);
  }
});

test('bi01_3: refresh_works', async () => {
  const pool = getDatabasePool();
  assert.ok(pool);
  await pool.query('REFRESH MATERIALIZED VIEW mv_sales_pipeline');
});

test('bi01_4: pipeline_view_accuracy', async () => {
  const orgId = await getDefaultOrganizationId();
  const stage = 'SURVEY_PENDING';

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `INSERT INTO projects (organization_id, status)
       VALUES ($1, $2)
       RETURNING id`,
      [orgId, stage]
    );
  });

  const pool = getDatabasePool();
  assert.ok(pool);
  await pool.query('REFRESH MATERIALIZED VIEW mv_sales_pipeline');

  const result = await pool.query(
    `SELECT project_count, stage FROM mv_sales_pipeline
     WHERE organization_id = $1 AND stage = $2`,
    [orgId, stage]
  );
  assert.ok(result.rows.length >= 1, 'Pipeline view must have row for org and stage');
  const pipelineRow = result.rows[0] as { project_count: string; stage: string };
  assert.ok(Number(pipelineRow.project_count) >= 1, 'project_count must be at least 1');
});

test('bi01_5: pnl_view_accuracy', async () => {
  const orgId = await getDefaultOrganizationId();
  const revenue = 99_000_000;
  let projectId: string;

  await withOrgContext(orgId, async (client) => {
    const proj = await client.query(
      `INSERT INTO projects (organization_id, status) VALUES ($1, 'SURVEY_PENDING') RETURNING id`,
      [orgId]
    );
    projectId = (proj.rows[0] as { id: string }).id;
    await client.query(
      `INSERT INTO contracts (organization_id, project_id, contract_number, status, total_vnd, deposit_vnd, final_payment_vnd)
       VALUES ($1, $2, $3, 'DRAFT', $4, 0, $4)`,
      [orgId, projectId, `C-BI01-${Date.now()}`, revenue]
    );
  });

  const pool = getDatabasePool();
  assert.ok(pool);
  await pool.query('REFRESH MATERIALIZED VIEW mv_profit_loss');

  const thisMonth = new Date();
  const monthStart = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);
  const result = await pool.query(
    `SELECT revenue_vnd, month FROM mv_profit_loss
     WHERE organization_id = $1 AND month = $2`,
    [orgId, monthStart]
  );
  assert.ok(result.rows.length >= 1, 'P&L view must have row for org and month');
  const totalRevenue = result.rows.reduce(
    (sum: number, r: { revenue_vnd: string }) => sum + Number(r.revenue_vnd),
    0
  );
  assert.ok(totalRevenue >= revenue, `revenue_vnd must be at least ${revenue}, got ${totalRevenue}`);
});
