import { withOrgContext } from '../config/database';
import { normalizePhone } from '../../../shared/src/utils/phone';

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

    return result.rows[0] as Lead;
  });
}
