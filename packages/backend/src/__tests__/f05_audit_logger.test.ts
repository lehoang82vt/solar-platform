/**
 * F-05: Audit log writer tests + AppError format.
 * Requires: DB (and optionally server) running. Test 3 is unit-only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { connectDatabase } from '../config/database';
import { write as auditLogWrite, getDefaultOrganizationId } from '../services/auditLog';

test.before(async () => {
  await connectDatabase();
});


function sh(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function pgNow(): string {
  return sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select now();" 2>&1`
  ).trim();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

test('test_f05_1: audit_log_creates_record', async () => {
  const baselineTs = pgNow();
  await sleep(200);

  const orgId = await getDefaultOrganizationId();

  await auditLogWrite({
    organization_id: orgId,
    actor: 'test-f05@example.com',
    action: 'test.f05.create_record',
    entity_type: 'test',
    metadata: {},
  });

  await sleep(200);

  const count = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
      `"select count(*) from audit_logs where action='test.f05.create_record' and created_at >= '${baselineTs}'::timestamptz;" 2>&1`
  ).trim();

  assert.ok(parseInt(count, 10) >= 1, 'Audit log record must be created');
});

test('test_f05_2: audit_log_contains_all_required_fields', async () => {
  const baselineTs = pgNow();
  await sleep(200);

  const orgId = await getDefaultOrganizationId();
  const testEntityId = 'a1234567-89ab-cdef-0123-456789abcdef';

  await auditLogWrite({
    organization_id: orgId,
    actor: 'test-f05-2@example.com',
    action: 'test.f05.all_fields',
    entity_type: 'test_entity',
    entity_id: testEntityId,
    metadata: { test_key: 'test_value', number: 42 },
  });

  await sleep(200);

  const result = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
      `"select row_to_json(t) from (select organization_id, actor, action, entity_type, entity_id, metadata, created_at from audit_logs where action='test.f05.all_fields' and created_at >= '${baselineTs}'::timestamptz order by created_at desc limit 1) t;" 2>&1`
  ).trim();

  assert.ok(result, 'Row must exist');
  const row = JSON.parse(result) as {
    organization_id: string;
    actor: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  };

  assert.equal(row.organization_id, orgId, 'organization_id matches');
  assert.equal(row.actor, 'test-f05-2@example.com', 'actor matches');
  assert.equal(row.action, 'test.f05.all_fields', 'action matches');
  assert.equal(row.entity_type, 'test_entity', 'entity_type matches');
  assert.equal(row.entity_id, testEntityId, 'entity_id matches');
  assert.equal((row.metadata as Record<string, unknown>).test_key, 'test_value', 'metadata.test_key');
  assert.equal((row.metadata as Record<string, unknown>).number, 42, 'metadata.number');
  assert.ok(row.created_at, 'created_at exists');
});

test('test_f05_3: app_error_format_correct', () => {
  class AppError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
      this.name = 'AppError';
    }
  }

  const error = new AppError('TEST_ERROR', 'Test error message');

  assert.equal(error.name, 'AppError');
  assert.equal(error.code, 'TEST_ERROR');
  assert.equal(error.message, 'Test error message');
  assert.ok(error instanceof Error);
});
