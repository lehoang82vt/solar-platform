import { withOrgContext } from '../config/database';

export interface SalesDashboardStats {
  leads_count: number;
  projects_count: number;
  quotes_count: number;
  conversion_rate: number;
}

export interface RecentLead {
  id: string;
  phone: string;
  customer_name: string | null;
  status: string;
  created_at: string;
}

/**
 * Get dashboard stats for sales portal: counts and conversion rate.
 * conversion_rate = (projects / leads) * 100 when leads > 0, else 0.
 */
export async function getSalesDashboardStats(
  organizationId: string
): Promise<SalesDashboardStats> {
  return await withOrgContext(organizationId, async (client) => {
    const [leadsRes, projectsRes, quotesRes] = await Promise.all([
      client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM leads WHERE organization_id = $1`,
        [organizationId]
      ),
      client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM projects WHERE organization_id = $1`,
        [organizationId]
      ),
      client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM quotes WHERE organization_id = $1`,
        [organizationId]
      ),
    ]);

    const leads_count = parseInt(leadsRes.rows[0]?.count ?? '0', 10);
    const projects_count = parseInt(projectsRes.rows[0]?.count ?? '0', 10);
    const quotes_count = parseInt(quotesRes.rows[0]?.count ?? '0', 10);
    const conversion_rate =
      leads_count > 0 ? Math.round((projects_count / leads_count) * 100) : 0;

    return {
      leads_count,
      projects_count,
      quotes_count,
      conversion_rate,
    };
  });
}

/**
 * Get recent leads for dashboard (last N by created_at).
 */
export async function getRecentLeads(
  organizationId: string,
  limit: number = 5
): Promise<RecentLead[]> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query<RecentLead>(
      `SELECT id, phone, customer_name, status, created_at
       FROM leads
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [organizationId, limit]
    );
    return result.rows;
  });
}
