import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

function sh(cmd: string): string {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

test('test_f02_1: migrate_clean_db_succeeds', () => {
  // If DB is not clean, migrate is still required to succeed idempotently.
  sh('npm run migrate');
  assert.ok(true);
});

test('test_f02_2: rollback_and_remigrate_succeeds', () => {
  sh('npm run migrate:rollback');
  sh('npm run migrate');
  assert.ok(true);
});

test('test_f02_3: rls_blocks_without_org_context', () => {
  const out = sh(
    'docker compose exec -T postgres psql -U app_user -d solar -c "reset all; select count(*) from audit_logs;" 2>&1'
  );
  // Expect count = 0 (no org context)
  assert.match(out, /\n\s*0\s*\n/);
});

test('test_f02_4: rls_allows_with_correct_org_context', () => {
  const orgId = sh(
    'docker compose exec -T postgres psql -U postgres -d solar -tAc "select id from organizations order by created_at asc limit 1" 2>&1'
  ).trim();
  assert.ok(orgId.length > 0);

  const out = sh(
    `docker compose exec -T postgres psql -U app_user -d solar -c \"reset all; set app.current_org_id='${orgId}'; select count(*) from audit_logs;\" 2>&1`
  );

  // Seed ensures exactly 1 row exists in audit_logs
  assert.match(out, /\n\s*1\s*\n/);
});

test('test_f02_5: seed_data_exists_after_migrate', () => {
  const out = sh(
    'docker compose exec -T postgres psql -U postgres -d solar -c "select count(*) from organizations;" 2>&1'
  );
  assert.match(out, /\n\s*1\s*\n/);
});

