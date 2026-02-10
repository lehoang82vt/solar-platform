/**
 * JOB-02: Cleanup worker – deletes old notification logs, expired OTP challenges.
 */
import { getDatabasePool, withOrgContext } from '../config/database';

const KEEP_DAYS = 90;

export async function cleanupOldLogs(): Promise<{ notificationLogs: number; otpChallenges: number }> {
  const pool = getDatabasePool();
  if (!pool) return { notificationLogs: 0, otpChallenges: 0 };

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - KEEP_DAYS);

  const orgResult = await pool.query<{ id: string }>(
    'SELECT id FROM organizations ORDER BY created_at ASC'
  );

  let notificationLogs = 0;
  let otpChallenges = 0;

  for (const row of orgResult.rows) {
    const n = await withOrgContext(row.id, async (client) => {
      const r = await client.query(
        `DELETE FROM notification_logs WHERE created_at < $1 AND status IN ('SENT', 'FAILED')`,
        [cutoffDate]
      );
      return r.rowCount ?? 0;
    });
    notificationLogs += n;

    const o = await withOrgContext(row.id, async (client) => {
      const r = await client.query(
        `DELETE FROM otp_challenges WHERE expires_at < NOW()`
      );
      return r.rowCount ?? 0;
    });
    otpChallenges += o;
  }

  return { notificationLogs, otpChallenges };
}
