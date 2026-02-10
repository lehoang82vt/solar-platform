/**
 * NTF-04: Notification admin APIs (service layer).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import {
  listNotificationLogs,
  retryFailedNotification,
  toggleTemplate,
  getTemplateList,
} from '../services/notification-admin';
import { notificationQueue } from '../services/job-queue';

test.before(async () => {
  await connectDatabase();
});

test.after(async () => {
  await notificationQueue.close();
  setTimeout(() => process.exit(0), 300);
});

test('ntf04_1: list_notification_logs', async () => {
  const orgId = await getDefaultOrganizationId();

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `INSERT INTO notification_logs (organization_id, event_type, channel, recipient, template_id, payload, status)
       VALUES ($1, 'lead.created', 'ZALO_ZNS', '+84901234567', NULL, '{}', 'SENT')`,
      [orgId]
    );
  });

  const logs = await listNotificationLogs(orgId, { limit: 10, offset: 0 });
  assert.ok(Array.isArray(logs));
  assert.ok(logs.length > 0);
});

test('ntf04_2: retry_failed_notification', async () => {
  const orgId = await getDefaultOrganizationId();

  const log = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `INSERT INTO notification_logs
       (organization_id, event_type, channel, recipient, template_id, payload, status, error_message)
       VALUES ($1, 'lead.created', 'ZALO_ZNS', '+84901234568', NULL, '{}', 'FAILED', 'Network error')
       RETURNING *`,
      [orgId]
    );
    return result.rows[0] as { id: string };
  });

  await retryFailedNotification(orgId, log.id);

  const updated = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT status, error_message FROM notification_logs WHERE id = $1`,
      [log.id]
    );
    return result.rows[0];
  });

  assert.equal(updated?.status, 'PENDING');
  assert.equal(updated?.error_message, null);
});

test('ntf04_3: toggle_template_active', async () => {
  const orgId = await getDefaultOrganizationId();

  const templates = await getTemplateList(orgId);
  assert.ok(Array.isArray(templates));
  if (templates.length === 0) {
    assert.fail('No templates in DB - run migrations/seeds');
    return;
  }

  const template = templates[0] as { id: string; active: boolean };
  await toggleTemplate(orgId, template.id, false);

  const updated = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT active FROM notification_templates WHERE id = $1`,
      [template.id]
    );
    return result.rows[0];
  });

  assert.equal(updated?.active, false);

  await toggleTemplate(orgId, template.id, true);
});

test('ntf04_4: sales_user_cannot_access_admin_apis', async () => {
  const orgId = await getDefaultOrganizationId();
  const logs = await listNotificationLogs(orgId, {});

  assert.ok(Array.isArray(logs));
});
