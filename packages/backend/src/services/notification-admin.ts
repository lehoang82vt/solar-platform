/**
 * NTF-04: Notification admin – list logs, retry failed, template toggle.
 */
import { withOrgContext } from '../config/database';
import { notificationQueue } from './job-queue';

export interface ListLogsFilters {
  status?: 'PENDING' | 'SENT' | 'FAILED';
  event_type?: string;
  from_date?: Date;
  to_date?: Date;
  limit?: number;
  offset?: number;
}

export async function listNotificationLogs(
  organizationId: string,
  filters: ListLogsFilters
): Promise<Record<string, unknown>[]> {
  return await withOrgContext(organizationId, async (client) => {
    let query = `
      SELECT nl.*, nt.event_type AS nt_event_type, nt.channel AS nt_channel
      FROM notification_logs nl
      LEFT JOIN notification_templates nt ON nl.template_id = nt.id AND nt.organization_id = nl.organization_id
      WHERE nl.organization_id = $1
    `;
    const params: unknown[] = [organizationId];
    let paramIndex = 2;

    if (filters.status) {
      query += ` AND nl.status = $${paramIndex++}`;
      params.push(filters.status);
    }
    if (filters.event_type) {
      query += ` AND (nt.event_type = $${paramIndex} OR nl.event_type = $${paramIndex})`;
      paramIndex++;
      params.push(filters.event_type);
    }
    if (filters.from_date) {
      query += ` AND nl.created_at >= $${paramIndex++}`;
      params.push(filters.from_date);
    }
    if (filters.to_date) {
      query += ` AND nl.created_at <= $${paramIndex++}`;
      params.push(filters.to_date);
    }

    query += ` ORDER BY nl.created_at DESC`;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(filters.limit ?? 50, filters.offset ?? 0);

    const result = await client.query(query, params);
    return result.rows as Record<string, unknown>[];
  });
}

export async function retryFailedNotification(
  organizationId: string,
  logId: string
): Promise<{ success: boolean }> {
  const log = await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM notification_logs WHERE id = $1 AND organization_id = $2`,
      [logId, organizationId]
    );
    return result.rows[0];
  });

  if (!log) throw new Error('Notification log not found');
  if ((log.status as string) !== 'FAILED') {
    throw new Error('Can only retry failed notifications');
  }

  await withOrgContext(organizationId, async (client) => {
    await client.query(
      `UPDATE notification_logs
       SET status = 'PENDING', error_message = NULL, sent_at = NULL
       WHERE id = $1 AND organization_id = $2`,
      [logId, organizationId]
    );
  });

  await notificationQueue.add({ logId, organizationId });
  return { success: true };
}

export async function toggleTemplate(
  organizationId: string,
  templateId: string,
  active: boolean
): Promise<{ success: boolean }> {
  await withOrgContext(organizationId, async (client) => {
    await client.query(
      `UPDATE notification_templates SET active = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
      [active, templateId, organizationId]
    );
  });
  return { success: true };
}

export async function getTemplateList(
  organizationId: string
): Promise<Record<string, unknown>[]> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM notification_templates
       WHERE organization_id = $1
       ORDER BY event_type, channel`,
      [organizationId]
    );
    return result.rows as Record<string, unknown>[];
  });
}
