/**
 * JOB-01: Cron-based scheduler for BI refresh, pending notifications, cleanup.
 */
import cron from 'node-cron';
import {
  biRefreshQueue,
  notificationQueue,
  getPendingNotifications,
  cleanupOldLogs,
} from './job-queue';

/** Run the BI refresh cron task (for tests). */
export async function runBiRefreshCron(): Promise<void> {
  await biRefreshQueue.add({}, { priority: 1 });
}

/** Run the pending-notifications cron task (for tests). */
export async function runNotificationCron(): Promise<void> {
  const pending = await getPendingNotifications();
  for (const log of pending) {
    await notificationQueue.add(
      { logId: log.id, organizationId: log.organization_id },
      { priority: 1 }
    );
  }
}

/** Run the cleanup cron task (for tests). */
export async function runCleanupCron(): Promise<number> {
  return await cleanupOldLogs();
}

export function startScheduler(): void {
  cron.schedule('0 * * * *', runBiRefreshCron);
  cron.schedule('*/5 * * * *', runNotificationCron);
  cron.schedule('0 2 * * *', () => runCleanupCron());
}
