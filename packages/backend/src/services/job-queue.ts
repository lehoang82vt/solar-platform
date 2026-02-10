/**
 * JOB-01: Bull queues for notifications and BI refresh.
 */
import Queue from 'bull';
import { getRedisOptions } from '../config/redis';
import { withOrgContext, getDatabasePool } from '../config/database';
import { ZaloZNSAdapter } from './adapters/zalo-zns';
import { SMSAdapter } from './adapters/sms';
import { retryWithBackoff } from './retry';

const redisOpts = getRedisOptions();

export const notificationQueue = new Queue<{ logId: string; organizationId: string }>(
  'notifications',
  {
    redis: redisOpts,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    },
  }
);

export const biRefreshQueue = new Queue<Record<string, never>>('bi-refresh', {
  redis: redisOpts,
});

export interface PendingNotification {
  id: string;
  organization_id: string;
}

/** Get all PENDING notification log ids (per-org to satisfy RLS). */
export async function getPendingNotifications(): Promise<PendingNotification[]> {
  const pool = getDatabasePool();
  if (!pool) return [];
  const orgResult = await pool.query<{ id: string }>(
    'SELECT id FROM organizations ORDER BY created_at ASC'
  );
  const out: PendingNotification[] = [];
  for (const row of orgResult.rows) {
    const list = await withOrgContext(row.id, async (client) => {
      const r = await client.query<{ id: string }>(
        `SELECT id FROM notification_logs WHERE status = 'PENDING'`
      );
      return r.rows.map((r2) => ({ id: r2.id, organization_id: row.id }));
    });
    out.push(...list);
  }
  return out;
}

/** Mark old notification logs (e.g. older than 90 days) for cleanup or delete. */
export async function cleanupOldLogs(): Promise<number> {
  const pool = getDatabasePool();
  if (!pool) return 0;
  const orgResult = await pool.query<{ id: string }>(
    'SELECT id FROM organizations ORDER BY created_at ASC'
  );
  let total = 0;
  for (const row of orgResult.rows) {
    const deleted = await withOrgContext(row.id, async (client) => {
      const r = await client.query(
        `DELETE FROM notification_logs WHERE status IN ('SENT', 'FAILED') AND created_at < NOW() - INTERVAL '90 days'`
      );
      return r.rowCount ?? 0;
    });
    total += deleted;
  }
  return total;
}

/** Send a single notification log (Zalo then SMS fallback, update status). */
export async function sendNotification(
  logId: string,
  organizationId: string
): Promise<void> {
  const zalo = new ZaloZNSAdapter();
  const sms = new SMSAdapter();

  const log = await withOrgContext(organizationId, async (client) => {
    const r = await client.query(
      `SELECT id, recipient, template_id, payload FROM notification_logs WHERE id = $1 AND organization_id = $2`,
      [logId, organizationId]
    );
    return r.rows[0] as
      | {
          id: string;
          recipient: string;
          template_id: string | null;
          payload: unknown;
        }
      | undefined;
  });

  if (!log) throw new Error(`Notification log not found: ${logId}`);

  const templateId = log.template_id ?? 'mock-tpl';
  const payload =
    log.payload && typeof log.payload === 'object'
      ? (log.payload as Record<string, unknown>)
      : {};
  const smsBody =
    typeof payload.message === 'string' ? payload.message : 'Notification';

  let sent = false;
  let lastError: Error | null = null;

  const tryZalo = () => zalo.send(log.recipient, templateId, payload);
  const trySms = () => sms.send(log.recipient, smsBody);

  try {
    await retryWithBackoff(tryZalo, 3, 100);
    sent = true;
  } catch (e) {
    lastError = e instanceof Error ? e : new Error(String(e));
    try {
      await retryWithBackoff(trySms, 3, 100);
      sent = true;
    } catch (e2) {
      lastError = e2 instanceof Error ? e2 : new Error(String(e2));
    }
  }

  await withOrgContext(organizationId, async (client) => {
    if (sent) {
      await client.query(
        `UPDATE notification_logs SET status = 'SENT', sent_at = NOW(), error_message = NULL WHERE id = $1 AND organization_id = $2`,
        [logId, organizationId]
      );
    } else {
      await client.query(
        `UPDATE notification_logs SET status = 'FAILED', error_message = $1 WHERE id = $2 AND organization_id = $3`,
        [lastError?.message ?? 'Unknown error', logId, organizationId]
      );
    }
  });
}

// Processors are registered by workers (notification-worker.ts, bi-worker.ts)
