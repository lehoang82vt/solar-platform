import { withOrgContext } from '../config/database';
import { normalizePhone } from '../../../shared/src/utils/phone';
import { eventBus } from './event-bus';

export interface Lead {
  id: string;
  organization_id: string;
  phone: string;
  customer_name?: string | null;
  customer_address?: string | null;
  notes?: string | null;
  status: string;
  partner_code?: string;
  first_touch_partner?: string;
  created_at: string;
}

export interface CreateLeadInput {
  phone: string;
  customer_name?: string;
  customer_address?: string;
  notes?: string;
  partner_code?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

const LEAD_COLUMNS = `id, organization_id, phone, customer_name, customer_address, notes, status, partner_code, first_touch_partner, created_at`;

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
      `SELECT ${LEAD_COLUMNS} FROM leads WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
      [organizationId, phone]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0] as Lead;
    }

    const result = await client.query(
      `INSERT INTO leads
       (organization_id, phone, customer_name, customer_address, notes, status, partner_code, first_touch_partner, utm_source, utm_medium, utm_campaign)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10)
       RETURNING ${LEAD_COLUMNS}`,
      [
        organizationId,
        phone,
        input.customer_name || null,
        input.customer_address || null,
        input.notes || null,
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
      data: { lead_id: lead.id, customer_phone: lead.phone, customer_name: lead.customer_name },
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
    let query = `SELECT ${LEAD_COLUMNS} FROM leads WHERE organization_id = $1`;
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
      `SELECT ${LEAD_COLUMNS} FROM leads WHERE organization_id = $1 AND id = $2 LIMIT 1`,
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
       RETURNING ${LEAD_COLUMNS}`,
      [status, organizationId, leadId]
    );
    return (result.rows[0] as Lead) ?? null;
  });
}

export interface UpdateLeadInput {
  customer_name?: string | null;
  customer_address?: string | null;
  notes?: string | null;
  phone?: string;
}

/**
 * Update lead fields (name, address, notes, phone).
 */
export async function updateLead(
  organizationId: string,
  leadId: string,
  input: UpdateLeadInput
): Promise<Lead | null> {
  const sets: string[] = [];
  const params: (string | null)[] = [];
  let idx = 1;

  if (input.customer_name !== undefined) {
    sets.push(`customer_name = $${idx++}`);
    params.push(input.customer_name);
  }
  if (input.customer_address !== undefined) {
    sets.push(`customer_address = $${idx++}`);
    params.push(input.customer_address);
  }
  if (input.notes !== undefined) {
    sets.push(`notes = $${idx++}`);
    params.push(input.notes);
  }
  if (input.phone !== undefined) {
    sets.push(`phone = $${idx++}`);
    params.push(normalizePhone(input.phone));
  }

  if (sets.length === 0) return getLeadById(organizationId, leadId);

  sets.push(`updated_at = NOW()`);

  const orgIdx = idx++;
  const idIdx = idx;
  params.push(organizationId, leadId);

  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `UPDATE leads SET ${sets.join(', ')}
       WHERE organization_id = $${orgIdx} AND id = $${idIdx}
       RETURNING ${LEAD_COLUMNS}`,
      params
    );
    return (result.rows[0] as Lead) ?? null;
  });
}
