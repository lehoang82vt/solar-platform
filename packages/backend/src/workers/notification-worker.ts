/**
 * JOB-02: Notification worker – processes notification queue (Zalo → SMS fallback).
 */
import { withOrgContext } from '../config/database';
import { notificationQueue } from '../services/job-queue';
import { ZaloZNSAdapter } from '../services/adapters/zalo-zns';
import { SMSAdapter } from '../services/adapters/sms';

const zalo = new ZaloZNSAdapter();
const sms = new SMSAdapter();

export interface NotificationLogRow {
  id: string;
  organization_id: string;
  recipient: string;
  channel: string;
  status: string;
  template_id: string | null;
  payload: Record<string, unknown>;
  template?: { template_id: string; body: string };
}

export async function getNotificationLog(
  organizationId: string,
  logId: string
): Promise<NotificationLogRow | null> {
  const row = await withOrgContext(organizationId, async (client) => {
    const r = await client.query(
      `SELECT nl.id, nl.organization_id, nl.recipient, nl.channel, nl.status, nl.template_id, nl.payload,
              nt.template_id AS zalo_template_id, nt.body AS template_body
       FROM notification_logs nl
       LEFT JOIN notification_templates nt ON nt.id = nl.template_id AND nt.organization_id = nl.organization_id
       WHERE nl.id = $1 AND nl.organization_id = $2`,
      [logId, organizationId]
    );
    const x = r.rows[0];
    if (!x) return null;
    return {
      id: x.id,
      organization_id: x.organization_id,
      recipient: x.recipient,
      channel: x.channel,
      status: x.status,
      template_id: x.template_id ?? x.zalo_template_id,
      payload: (x.payload && typeof x.payload === 'object' ? x.payload : {}) as Record<string, unknown>,
      template: {
        template_id: (x.zalo_template_id || x.template_id || 'mock-tpl') as string,
        body: (x.template_body as string) || 'Notification',
      },
    };
  });
  return row;
}

export async function updateNotificationLog(
  organizationId: string,
  logId: string,
  updates: { status: string; sent_at?: Date; error_message?: string | null }
): Promise<void> {
  await withOrgContext(organizationId, async (client) => {
    if (updates.sent_at !== undefined) {
      await client.query(
        `UPDATE notification_logs SET status = $1, sent_at = $2, error_message = $3 WHERE id = $4 AND organization_id = $5`,
        [updates.status, updates.sent_at, updates.error_message ?? null, logId, organizationId]
      );
    } else {
      await client.query(
        `UPDATE notification_logs SET status = $1, error_message = $2 WHERE id = $3 AND organization_id = $4`,
        [updates.status, updates.error_message ?? null, logId, organizationId]
      );
    }
  });
}

/** Simple {{key}} replacement. */
export function renderTemplate(
  body: string,
  payload: Record<string, unknown>
): string {
  let out = body;
  for (const [k, v] of Object.entries(payload)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v ?? ''));
  }
  return out;
}

export async function sendNotification(
  logId: string,
  organizationId: string
): Promise<void> {
  const log = await getNotificationLog(organizationId, logId);
  if (!log) throw new Error(`Notification log not found: ${logId}`);
  if (log.status === 'SENT') return;

  try {
    if (log.channel === 'ZALO_ZNS') {
      const result = await zalo.send(
        log.recipient,
        log.template?.template_id ?? String(log.template_id ?? 'mock-tpl'),
        log.payload
      );
      if (result.success) {
        await updateNotificationLog(organizationId, logId, {
          status: 'SENT',
          sent_at: new Date(),
        });
        return;
      }
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    try {
      const smsBody = renderTemplate(
        log?.template?.body ?? 'Notification',
        log?.payload ?? {}
      );
      await sms.send(log!.recipient, smsBody);
      await updateNotificationLog(organizationId, logId, {
        status: 'SENT',
        sent_at: new Date(),
        error_message: `Zalo failed, SMS sent: ${err.message}`,
      });
    } catch (smsError) {
      const smsErr = smsError instanceof Error ? smsError : new Error(String(smsError));
      await updateNotificationLog(organizationId, logId, {
        status: 'FAILED',
        error_message: `Both failed: ${err.message}, ${smsErr.message}`,
      });
      throw smsError;
    }
    return;
  }

  await updateNotificationLog(organizationId, logId, {
    status: 'FAILED',
    error_message: 'Unsupported channel or send failed',
  });
  throw new Error('Unsupported channel or send failed');
}

notificationQueue.process(async (job) => {
  const { logId, organizationId } = job.data;
  await sendNotification(logId, organizationId);
});
