import { withOrgContext } from '../config/database';
import { normalizePhone } from '../../../shared/src/utils/phone';
import { eventBus } from './event-bus';

export interface Lead {
  id: string;
  organization_id: string;
  phone: string;
  status: string;
  partner_code?: string;
  first_touch_partner?: string;
  created_at: string;
}

export interface CreateLeadInput {
  phone: string;
  partner_code?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

/**
 * Create lead with first-touch partner attribution.
 * Phone normalized to E.164. Status RECEIVED.
 * If lead exists with same phone: return it (idempotent).
 */
export async function createLead(
  organizationId: string,
  input: CreateLeadInput
): Promise<Lead> {
  const phone = normalizePhone(input.phone);

  return await withOrgContext(organizationId, async (client) => {
    const existing = await client.query(
      `SELECT id, organization_id, phone, status, partner_code, first_touch_partner, created_at
       FROM leads WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
      [organizationId, phone]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0] as Lead;
    }

    const result = await client.query(
      `INSERT INTO leads 
       (organization_id, phone, status, partner_code, first_touch_partner, utm_source, utm_medium, utm_campaign)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7)
       RETURNING id, organization_id, phone, status, partner_code, first_touch_partner, created_at`,
      [
        organizationId,
        phone,
        'RECEIVED',
        input.partner_code || null,
        input.utm_source || null,
        input.utm_medium || null,
        input.utm_campaign || null,
      ]
    );

    const lead = result.rows[0] as Lead;
    await eventBus.emit({
      type: 'lead.created',
      organizationId,
      data: { lead_id: lead.id, customer_phone: lead.phone },
    });
    return lead;
  });
}

/**
 * List leads for organization with optional status filter.
 */
export async function listLeads(
  organizationId: string,
  filters?: { status?: string }
): Promise<Lead[]> {
  return await withOrgContext(organizationId, async (client) => {
    let query = `SELECT id, organization_id, phone, status, partner_code, first_touch_partner, created_at
                 FROM leads WHERE organization_id = $1`;
    const params: string[] = [organizationId];
    if (filters?.status) {
      query += ` AND status = $2`;
      params.push(filters.status);
    }
    query += ` ORDER BY created_at DESC`;
    const result = await client.query(query, params);
    return result.rows as Lead[];
  });
}

/**
 * Get a single lead by id (org-scoped).
 */
export async function getLeadById(
  organizationId: string,
  leadId: string
): Promise<Lead | null> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT id, organization_id, phone, status, partner_code, first_touch_partner, created_at
       FROM leads WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [organizationId, leadId]
    );
    return (result.rows[0] as Lead) ?? null;
  });
}

/** Allowed status values for lead status update */
const ALLOWED_STATUSES = ['RECEIVED', 'CONTACTED', 'QUALIFIED', 'LOST'];

/**
 * Update lead status (org-scoped).
 */
export async function updateLeadStatus(
  organizationId: string,
  leadId: string,
  status: string
): Promise<Lead | null> {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `UPDATE leads SET status = $1, updated_at = NOW()
       WHERE organization_id = $2 AND id = $3
       RETURNING id, organization_id, phone, status, partner_code, first_touch_partner, created_at`,
      [status, organizationId, leadId]
    );
    return (result.rows[0] as Lead) ?? null;
  });
}
