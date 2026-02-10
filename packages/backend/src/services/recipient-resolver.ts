/**
 * NTF-02: Resolve notification recipients by event type and payload.
 */
import { withOrgContext } from '../config/database';
import type { EventType } from './event-bus';

export async function resolveRecipients(
  orgId: string,
  eventType: EventType,
  data: Record<string, unknown>
): Promise<string[]> {
  const recipients: string[] = [];

  if (eventType === 'lead.created') {
    const phone = (data.customer_phone ?? data.phone) as string | undefined;
    if (phone) recipients.push(phone);
    return recipients;
  }

  if (eventType.startsWith('partner.') || eventType === 'commission.paid' || eventType === 'commission.approved') {
    const partnerId = data.partner_id as string | undefined;
    if (!partnerId) return [];
    const list = await withOrgContext(orgId, async (client) => {
      const r = await client.query<{ phone: string | null }>(
        `SELECT phone FROM partners WHERE id = $1 AND organization_id = $2`,
        [partnerId, orgId]
      );
      return r.rows;
    });
    const phone = list[0]?.phone;
    if (phone) recipients.push(phone);
    return recipients;
  }

  if (eventType.startsWith('quote.') || eventType.startsWith('contract.')) {
    const projectId = (data.project_id ?? data.projectId) as string | undefined;
    if (!projectId) return [];
    await withOrgContext(orgId, async (client) => {
      const proj = await client.query<{ customer_phone: string | null; assigned_to: string | null }>(
        `SELECT customer_phone, assigned_to FROM projects WHERE id = $1 AND organization_id = $2`,
        [projectId, orgId]
      );
      const row = proj.rows[0];
      if (row?.customer_phone) recipients.push(row.customer_phone);
      if (row?.assigned_to) {
        const user = await client.query<{ email: string }>(
          `SELECT email FROM users WHERE id = $1 AND organization_id = $2`,
          [row.assigned_to, orgId]
        );
        if (user.rows[0]?.email) recipients.push(user.rows[0].email);
      }
    });
    return recipients;
  }

  return recipients;
}
