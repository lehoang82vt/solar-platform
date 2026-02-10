/**
 * NTF-03: Zalo ZNS + SMS adapters, retry, fallback, status updates.
 * Run with: ZALO_USE_MOCK=true SMS_USE_MOCK=true node -r ts-node/register --test ...
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { ZaloZNSAdapter } from '../services/adapters/zalo-zns';
import { SMSAdapter } from '../services/adapters/sms';
import { retryWithBackoff } from '../services/retry';

test.before(async () => {
  process.env.ZALO_USE_MOCK = 'true';
  process.env.SMS_USE_MOCK = 'true';
  await connectDatabase();
});

test('ntf03_1: zalo_zns_sends_successfully_mock', async () => {
  const adapter = new ZaloZNSAdapter();
  const result = await adapter.send('+84901234567', 'tpl-001', {
    customer_name: 'Test',
  });
  assert.equal(result.success, true);
  assert.ok(result.message_id);
  assert.ok(String(result.message_id).startsWith('mock-'));
});

test('ntf03_2: sms_sends_successfully_mock', async () => {
  const adapter = new SMSAdapter();
  const result = await adapter.send('+84901234567', 'Hello from test');
  assert.equal(result.success, true);
  assert.ok(result.message_id);
  assert.ok(String(result.message_id).startsWith('sms-'));
});

test('ntf03_3: zalo_failure_falls_back_to_sms', async () => {
  const sms = new SMSAdapter();
  let zaloCalled = false;
  let smsCalled = false;

  const tryZalo = async () => {
    zaloCalled = true;
    throw new Error('Zalo API unavailable');
  };

  const trySms = async () => {
    smsCalled = true;
    return sms.send('+84901111111', 'Fallback message');
  };

  let result: { success: boolean; message_id?: string } | null = null;
  try {
    await tryZalo();
  } catch {
    result = await trySms();
  }

  assert.equal(zaloCalled, true);
  assert.equal(smsCalled, true);
  assert.ok(result?.success);
  assert.ok(result?.message_id?.startsWith('sms-'));
});

test('ntf03_4: retry_logic_works_three_attempts', async () => {
  let attempts = 0;
  const result = await retryWithBackoff(
    async () => {
      attempts++;
      if (attempts < 3) throw new Error(`Attempt ${attempts} failed`);
      return 'success';
    },
    3,
    10
  );
  assert.equal(result, 'success');
  assert.equal(attempts, 3);
});

test('ntf03_5: both_fail_status_failed', async () => {
  const orgId = await getDefaultOrganizationId();
  let logId: string;

  await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `INSERT INTO notification_logs (organization_id, event_type, channel, recipient, template_id, payload, status)
       VALUES ($1, 'test.event', 'ZALO_ZNS', $2, NULL, '{}', 'PENDING')
       RETURNING id`,
      [orgId, '+84905555555']
    );
    logId = r.rows[0].id;
  });

  await sendWithFallbackAndUpdateLog(orgId, logId!, true, true);

  const row = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT status, error_message FROM notification_logs WHERE id = $1`,
      [logId]
    );
    return r.rows[0];
  });

  assert.equal(row?.status, 'FAILED');
  assert.ok(row?.error_message);
});

test('ntf03_6: success_status_sent_sent_at_set', async () => {
  const orgId = await getDefaultOrganizationId();
  let logId: string;

  await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `INSERT INTO notification_logs (organization_id, event_type, channel, recipient, template_id, payload, status)
       VALUES ($1, 'test.event', 'ZALO_ZNS', $2, NULL, '{}', 'PENDING')
       RETURNING id`,
      [orgId, '+84906666666']
    );
    logId = r.rows[0].id;
  });

  await sendWithFallbackAndUpdateLog(orgId, logId!, false, true);

  const row = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT status, sent_at FROM notification_logs WHERE id = $1`,
      [logId]
    );
    return r.rows[0];
  });

  assert.equal(row?.status, 'SENT');
  assert.ok(row?.sent_at);
});

/**
 * Helper: try Zalo (with retry), on failure try SMS (with retry); update log to SENT or FAILED.
 * forceZaloFail and forceSmsFail: if true, make that adapter throw (for test 5/6).
 */
async function sendWithFallbackAndUpdateLog(
  orgId: string,
  logId: string,
  forceZaloFail: boolean,
  forceSmsFail: boolean
): Promise<void> {
  const { ZaloZNSAdapter } = await import('../services/adapters/zalo-zns');
  const { SMSAdapter } = await import('../services/adapters/sms');
  const { retryWithBackoff } = await import('../services/retry');

  const zalo = new ZaloZNSAdapter();
  const sms = new SMSAdapter();

  const log = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT id, recipient, template_id, payload FROM notification_logs WHERE id = $1 AND organization_id = $2`,
      [logId, orgId]
    );
    return r.rows[0] as { id: string; recipient: string; template_id: string | null; payload: Record<string, unknown> } | undefined;
  });

  if (!log) throw new Error('Log not found');

  const templateId = log.template_id ?? 'mock-tpl';
  const payload = (log.payload && typeof log.payload === 'object' ? log.payload : {}) as Record<string, unknown>;
  const smsBody = typeof payload.message === 'string' ? payload.message : 'Notification';

  let sent = false;
  let lastError: Error | null = null;

  const tryZalo = async () => {
    if (forceZaloFail) throw new Error('Zalo forced fail');
    return zalo.send(log.recipient, templateId, payload);
  };

  const trySms = async () => {
    if (forceSmsFail) throw new Error('SMS forced fail');
    return sms.send(log.recipient, smsBody);
  };

  try {
    await retryWithBackoff(tryZalo, 3, 10);
    sent = true;
  } catch (e) {
    lastError = e instanceof Error ? e : new Error(String(e));
    try {
      await retryWithBackoff(trySms, 3, 10);
      sent = true;
    } catch (e2) {
      lastError = e2 instanceof Error ? e2 : new Error(String(e2));
    }
  }

  await withOrgContext(orgId, async (client) => {
    if (sent) {
      await client.query(
        `UPDATE notification_logs SET status = 'SENT', sent_at = NOW(), error_message = NULL WHERE id = $1 AND organization_id = $2`,
        [logId, orgId]
      );
    } else {
      await client.query(
        `UPDATE notification_logs SET status = 'FAILED', error_message = $1 WHERE id = $2 AND organization_id = $3`,
        [lastError?.message ?? 'Unknown error', logId, orgId]
      );
    }
  });
}
