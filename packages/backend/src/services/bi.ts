import { withOrgContext, getDatabasePool } from '../config/database';

/** BI-01: Names of materialized views (for refresh). */
export const MAT_VIEW_NAMES = [
  'mv_sales_pipeline',
  'mv_profit_loss',
  'mv_funnel_velocity',
  'mv_product_performance',
  'mv_salesperson_metrics',
] as const;

/**
 * BI-01: Refresh all materialized views. Use CONCURRENTLY in production (cron every 1h).
 */
export async function refreshMaterializedViews(concurrently = false): Promise<void> {
  const pool = getDatabasePool();
  if (!pool) throw new Error('Database pool not initialized');
  for (const name of MAT_VIEW_NAMES) {
    const sql = concurrently
      ? `REFRESH MATERIALIZED VIEW CONCURRENTLY ${name}`
      : `REFRESH MATERIALIZED VIEW ${name}`;
    await pool.query(sql);
  }
}

export interface PipelineMetrics {
  leads: { new: number; contacted: number; qualified: number };
  quotes: { draft: number; sent: number; approved: number };
  contracts: { signed: number; installing: number; completed: number };
}

/** No leads table in schema; return zeros. Quotes/contracts counted by status. */
export async function getPipelineMetrics(organizationId: string): Promise<PipelineMetrics> {
  return await withOrgContext(organizationId, async (client) => {
    const leads = { new: 0, contacted: 0, qualified: 0 };

    const quoteRows = await client.query<{ status: string; count: string }>(
      `SELECT status, count(*)::text as count FROM quotes GROUP BY status`
    );
    const quotes = { draft: 0, sent: 0, approved: 0 };
    for (const r of quoteRows.rows) {
      const n = parseInt(r.count, 10) || 0;
      const s = (r.status || '').toLowerCase();
      if (s === 'draft') quotes.draft = n;
      else if (s === 'sent') quotes.sent = n;
      else if (s === 'accepted' || s === 'approved') quotes.approved += n;
    }

    const contractRows = await client.query<{ status: string; count: string }>(
      `SELECT status, count(*)::text as count FROM contracts GROUP BY status`
    );
    const contracts = { signed: 0, installing: 0, completed: 0 };
    for (const r of contractRows.rows) {
      const n = parseInt(r.count, 10) || 0;
      const s = (r.status || '').toUpperCase();
      if (s === 'SIGNED') contracts.signed = n;
      else if (s === 'INSTALLING') contracts.installing = n;
      else if (s === 'COMPLETED') contracts.completed = n;
    }

    return { leads, quotes, contracts };
  });
}

export interface PnLSummary {
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  gross_margin_pct: number;
  contracts_count: number;
}

export async function getPnLSummary(
  organizationId: string,
  from: string,
  to: string
): Promise<PnLSummary> {
  return await withOrgContext(organizationId, async (client) => {
    const revResult = await client.query<{ total_revenue: string; contracts_count: string }>(
      `SELECT COALESCE(SUM(contract_value), 0)::text as total_revenue, count(*)::text as contracts_count
       FROM contracts
       WHERE status != 'CANCELLED'
         AND created_at >= $1::date AND created_at < ($2::date + interval '1 day')`,
      [from, to]
    );
    const total_revenue = Number(revResult.rows[0]?.total_revenue ?? 0);
    const contracts_count = parseInt(revResult.rows[0]?.contracts_count ?? '0', 10);

    const costResult = await client.query<{ total_cost: string }>(
      `SELECT COALESCE(SUM((financial_snapshot->>'total_cost')::numeric), 0)::text as total_cost
       FROM contracts
       WHERE status != 'CANCELLED'
         AND created_at >= $1::date AND created_at < ($2::date + interval '1 day')`,
      [from, to]
    );
    const total_cost = Number(costResult.rows[0]?.total_cost ?? 0);

    const gross_profit = total_revenue - total_cost;
    const gross_margin_pct = total_revenue > 0 ? (gross_profit / total_revenue) * 100 : 0;

    return {
      total_revenue,
      total_cost,
      gross_profit,
      gross_margin_pct: Math.round(gross_margin_pct * 100) / 100,
      contracts_count,
    };
  });
}

export interface SalesRankingRow {
  user_email: string;
  quotes_created: number;
  quotes_approved: number;
  revenue: number;
}

export async function getSalesRanking(
  organizationId: string,
  _period: string
): Promise<SalesRankingRow[]> {
  return await withOrgContext(organizationId, async (client) => {
    const rows = await client.query<{
      user_email: string;
      quotes_created: string;
      quotes_approved: string;
      revenue: string;
    }>(
      `WITH quote_creators AS (
         SELECT entity_id AS quote_id, actor AS user_email
         FROM audit_logs
         WHERE action = 'quote.create' AND entity_type = 'quote' AND entity_id IS NOT NULL
       ),
       approved_quotes AS (
         SELECT id FROM quotes WHERE LOWER(status) IN ('accepted', 'approved')
       ),
       contract_revenue AS (
         SELECT c.quote_id, c.contract_value
         FROM contracts c
         WHERE c.status != 'CANCELLED'
       )
       SELECT
         qc.user_email,
         count(DISTINCT qc.quote_id)::text AS quotes_created,
         count(DISTINCT CASE WHEN aq.id IS NOT NULL THEN qc.quote_id END)::text AS quotes_approved,
         COALESCE(SUM(cr.contract_value), 0)::text AS revenue
       FROM quote_creators qc
       LEFT JOIN approved_quotes aq ON aq.id = qc.quote_id
       LEFT JOIN contract_revenue cr ON cr.quote_id = qc.quote_id
       GROUP BY qc.user_email
       ORDER BY COALESCE(SUM(cr.contract_value), 0) DESC`
    );

    return rows.rows.map((r) => ({
      user_email: r.user_email,
      quotes_created: parseInt(r.quotes_created, 10) || 0,
      quotes_approved: parseInt(r.quotes_approved, 10) || 0,
      revenue: Number(r.revenue) || 0,
    }));
  });
}

export interface CashflowMonth {
  month: string;
  expected_in: number;
  expected_out: number;
  net: number;
}

/** BI-02: Overview metrics (total projects, revenue, active contracts, avg value). */
export interface BIOverview {
  total_projects: number;
  total_revenue_vnd: number;
  active_contracts: number;
  avg_project_value_vnd: number;
}

export async function getBIOverview(organizationId: string): Promise<BIOverview> {
  return await withOrgContext(organizationId, async (client) => {
    const projectCount = await client.query<{ count: string }>(
      `SELECT count(*)::text as count FROM projects`
    );
    const total_projects = parseInt(projectCount.rows[0]?.count ?? '0', 10) || 0;

    const revRow = await client.query<{ total_vnd: string; contract_count: string }>(
      `SELECT COALESCE(SUM(total_vnd), 0)::text as total_vnd, count(*)::text as contract_count
       FROM contracts WHERE total_vnd IS NOT NULL AND status != 'CANCELLED'`
    );
    const total_revenue_vnd = Number(revRow.rows[0]?.total_vnd ?? 0);
    const contractCount = parseInt(revRow.rows[0]?.contract_count ?? '0', 10) || 0;

    const activeRow = await client.query<{ count: string }>(
      `SELECT count(*)::text as count FROM contracts
       WHERE status IN ('SIGNED', 'INSTALLING', 'HANDOVER')`
    );
    const active_contracts = parseInt(activeRow.rows[0]?.count ?? '0', 10) || 0;

    const avg_project_value_vnd =
      contractCount > 0 ? Math.round(total_revenue_vnd / contractCount) : 0;

    return {
      total_projects,
      total_revenue_vnd,
      active_contracts,
      avg_project_value_vnd,
    };
  });
}

/** BI-02: P&L for a specific month (from mv_profit_loss). */
export interface ProfitLossMonth {
  month: string;
  revenue_vnd: number;
  deposit_vnd: number;
  contract_count: number;
  cost_vnd: number;
  margin_vnd: number;
}

export async function getProfitLoss(
  organizationId: string,
  year: number,
  month: number
): Promise<ProfitLossMonth | null> {
  return await withOrgContext(organizationId, async (client) => {
    const monthStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const rows = await client.query<{
      month: string;
      revenue_vnd: string;
      deposit_vnd: string;
      contract_count: string;
      cost_vnd: string;
      margin_vnd: string;
    }>(
      `SELECT month::text, revenue_vnd::text, deposit_vnd::text, contract_count::text,
              cost_vnd::text, margin_vnd::text
       FROM mv_profit_loss
       WHERE date_trunc('month', month) = date_trunc('month', $1::date)`,
      [monthStr]
    );
    const r = rows.rows[0];
    if (!r) return null;
    const m = r.month ? r.month.slice(0, 7) : '';
    return {
      month: m,
      revenue_vnd: Number(r.revenue_vnd) || 0,
      deposit_vnd: Number(r.deposit_vnd) || 0,
      contract_count: parseInt(r.contract_count, 10) || 0,
      cost_vnd: Number(r.cost_vnd) || 0,
      margin_vnd: Number(r.margin_vnd) || 0,
    };
  });
}

/** BI-02: Sales ranking from mv_salesperson_metrics, limit default 10. */
export interface SalesRankingRowV2 {
  user_id: string | null;
  salesperson_name: string | null;
  project_count: number;
  quote_count: number;
  contract_count: number;
  revenue_vnd: number;
}

export async function getSalesRankingV2(
  organizationId: string,
  limit: number = 10
): Promise<SalesRankingRowV2[]> {
  return await withOrgContext(organizationId, async (client) => {
    const rows = await client.query<{
      user_id: string | null;
      salesperson_name: string | null;
      project_count: string;
      quote_count: string;
      contract_count: string;
      revenue_vnd: string;
    }>(
      `SELECT user_id, salesperson_name, project_count::text, quote_count::text,
              contract_count::text, revenue_vnd::text
       FROM mv_salesperson_metrics
       ORDER BY revenue_vnd DESC NULLS LAST
       LIMIT $1`,
      [Math.max(1, Math.min(limit, 100))]
    );
    return rows.rows.map((r) => ({
      user_id: r.user_id,
      salesperson_name: r.salesperson_name,
      project_count: parseInt(r.project_count, 10) || 0,
      quote_count: parseInt(r.quote_count, 10) || 0,
      contract_count: parseInt(r.contract_count, 10) || 0,
      revenue_vnd: Number(r.revenue_vnd) || 0,
    }));
  });
}

/** BI-02: Partner performance (leads + attributed revenue placeholder). */
export interface PartnerStatRow {
  partner_id: string;
  name: string;
  referral_code: string;
  leads_count: number;
  contracts_count: number;
  revenue_vnd: number;
}

export async function getPartnerStats(organizationId: string): Promise<PartnerStatRow[]> {
  return await withOrgContext(organizationId, async (client) => {
    const rows = await client.query<{
      partner_id: string;
      name: string;
      referral_code: string;
      leads_count: string;
      contracts_count: string;
      revenue_vnd: string;
    }>(
      `SELECT p.id AS partner_id, p.name, p.referral_code,
              count(DISTINCT l.id)::text AS leads_count,
              count(DISTINCT c.id)::text AS contracts_count,
              COALESCE(SUM(c.total_vnd) FILTER (WHERE c.id IS NOT NULL), 0)::text AS revenue_vnd
       FROM partners p
       LEFT JOIN leads l ON l.partner_code = p.referral_code
       LEFT JOIN projects proj ON proj.lead_id = l.id
       LEFT JOIN contracts c ON c.project_id = proj.id AND c.status != 'CANCELLED'
       GROUP BY p.id, p.name, p.referral_code
       ORDER BY COALESCE(SUM(c.total_vnd), 0) DESC`
    );
    return rows.rows.map((r) => ({
      partner_id: r.partner_id,
      name: r.name,
      referral_code: r.referral_code,
      leads_count: parseInt(r.leads_count, 10) || 0,
      contracts_count: parseInt(r.contracts_count, 10) || 0,
      revenue_vnd: Number(r.revenue_vnd) || 0,
    }));
  });
}

/** BI-02: Cashflow in date range (deposit/payment timeline from contracts). */
export interface CashflowDay {
  date: string;
  deposit_in_vnd: number;
  payment_out_vnd: number;
  net_vnd: number;
}

export async function getCashflow(
  organizationId: string,
  from: Date,
  to: Date
): Promise<CashflowDay[]> {
  return await withOrgContext(organizationId, async (client) => {
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    const rows = await client.query<{
      d: string;
      deposit_in: string;
      payment_out: string;
    }>(
      `SELECT date_trunc('day', created_at)::date::text AS d,
              COALESCE(SUM(deposit_vnd), 0)::text AS deposit_in,
              0::bigint::text AS payment_out
       FROM contracts
       WHERE status != 'CANCELLED'
         AND created_at >= $1::date AND created_at < ($2::date + interval '1 day')
       GROUP BY date_trunc('day', created_at)
       ORDER BY d`,
      [fromStr, toStr]
    );
    return rows.rows.map((r) => {
      const deposit_in_vnd = Number(r.deposit_in) || 0;
      const payment_out_vnd = Number(r.payment_out) || 0;
      return {
        date: r.d?.slice(0, 10) ?? '',
        deposit_in_vnd,
        payment_out_vnd,
        net_vnd: deposit_in_vnd - payment_out_vnd,
      };
    });
  });
}

export async function getCashflowProjection(
  organizationId: string,
  months: number
): Promise<CashflowMonth[]> {
  return await withOrgContext(organizationId, async (client) => {
    const activeContracts = await client.query<{
      id: string;
      contract_value: string;
      payment_terms: string;
      signed_at: string | null;
      created_at: string;
    }>(
      `SELECT id, contract_value::text as contract_value, payment_terms::text as payment_terms,
              signed_at, created_at
       FROM contracts
       WHERE status IN ('SIGNED', 'INSTALLING', 'HANDOVER')`
    );

    const monthSums: Record<string, { in: number; out: number }> = {};
    const now = new Date();
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthSums[key] = { in: 0, out: 0 };
    }

    for (const c of activeContracts.rows) {
      let terms: { milestone?: string; pct?: number }[] = [];
      try {
        terms = JSON.parse(c.payment_terms || '[]');
      } catch {
        terms = [];
      }
      const value = Number(c.contract_value) || 0;
      const baseDate = c.signed_at ? new Date(c.signed_at) : new Date(c.created_at);

      terms.forEach((t, idx) => {
        const pct = Number(t.pct) || 0;
        const amount = (value * pct) / 100;
        const monthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + idx, 1);
        const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
        if (monthSums[key]) {
          monthSums[key].in += amount;
        }
      });
    }

    const result: CashflowMonth[] = Object.entries(monthSums)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { in: expected_in, out: expected_out }]) => ({
        month,
        expected_in: Math.round(expected_in),
        expected_out: Math.round(expected_out),
        net: Math.round(expected_in - expected_out),
      }));

    return result;
  });
}
