/**
 * NTF-01: Notification migration – templates table, logs table, 13 seed templates, unique constraint
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, getDatabasePool } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

test('ntf01_1: templates_table_exists', async () => {
  const pool = getDatabasePool();
  assert.ok(pool);
  const result = await pool!.query(
    `SELECT table_name FROM information_schema.tables 
     WHERE table_schema = 'public' AND table_name = 'notification_templates'`
  );
  assert.equal(result.rows.length, 1, 'notification_templates table must exist');
});

test('ntf01_2: logs_table_exists', async () => {
  const pool = getDatabasePool();
  assert.ok(pool);
  const result = await pool!.query(
    `SELECT table_name FROM information_schema.tables 
     WHERE table_schema = 'public' AND table_name = 'notification_logs'`
  );
  assert.equal(result.rows.length, 1, 'notification_logs table must exist');
});

test('ntf01_3: thirteen_templates_seeded', async () => {
  const pool = getDatabasePool();
  assert.ok(pool);
  const result = await pool!.query(
    `SELECT COUNT(*)::int AS cnt FROM notification_templates`
  );
  const count = result.rows[0]?.cnt ?? 0;
  assert.equal(count, 13, `Expected 13 seeded templates, got ${count}`);
});

test('ntf01_4: unique_constraint_org_event_channel', async () => {
  const pool = getDatabasePool();
  assert.ok(pool);
  const orgResult = await pool!.query(
    `SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1`
  );
  const orgId = orgResult.rows[0]?.id;
  assert.ok(orgId, 'Need at least one organization');

  await assert.rejects(
    async () => {
      await pool!.query(
        `INSERT INTO notification_templates (organization_id, event_type, channel, body)
         VALUES ($1, 'lead.created', 'ZALO_ZNS', 'Duplicate row')`,
        [orgId]
      );
    },
    /duplicate key|unique constraint/i,
    'Duplicate (organization_id, event_type, channel) must be rejected'
  );
});
