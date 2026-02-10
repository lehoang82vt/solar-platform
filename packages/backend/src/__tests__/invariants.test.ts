/**
 * INVARIANT TESTS (CRITICAL)
 * Validate critical system architecture rules.
 * If any fail, the system has serious design flaws.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { transition, StateMachineError, type StateMachine } from '../lib/state-machine';
import { normalizePhone, PhoneError } from '../../../shared/src/utils/phone';

function sh(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

test('test_inv_1: all_entities_have_org_id', () => {
  const tables = ['leads', 'partners', 'otp_challenges', 'audit_logs'];

  for (const table of tables) {
    const result = sh(
      `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
        `"SELECT column_name FROM information_schema.columns WHERE table_name='${table}' AND column_name='organization_id';" 2>&1`
    ).trim();

    assert.ok(result.length > 0, `Table ${table} must have organization_id column`);
  }
});

test('test_inv_2: state_machine_no_skip', () => {
  const leadSM: StateMachine<'RECEIVED' | 'CONTACTED' | 'QUALIFIED' | 'LOST'> = {
    states: ['RECEIVED', 'CONTACTED', 'QUALIFIED', 'LOST'],
    transitions: {
      RECEIVED: ['CONTACTED', 'LOST'],
      CONTACTED: ['QUALIFIED', 'LOST'],
      QUALIFIED: [],
      LOST: [],
    },
    initial: 'RECEIVED',
  };

  assert.throws(
    () => transition(leadSM, 'RECEIVED', 'QUALIFIED'),
    StateMachineError,
    'State machine must prevent skipping states'
  );
});

test('test_inv_3: state_machine_no_reverse', () => {
  const leadSM: StateMachine<'RECEIVED' | 'CONTACTED' | 'QUALIFIED'> = {
    states: ['RECEIVED', 'CONTACTED', 'QUALIFIED'],
    transitions: {
      RECEIVED: ['CONTACTED'],
      CONTACTED: ['QUALIFIED'],
      QUALIFIED: [],
    },
    initial: 'RECEIVED',
  };

  assert.throws(
    () => transition(leadSM, 'CONTACTED', 'RECEIVED'),
    StateMachineError,
    'State machine must prevent reverse transitions'
  );
});

test('test_inv_4: validation_backend_not_frontend', () => {
  assert.throws(
    () => normalizePhone('invalid'),
    PhoneError,
    'Backend must validate all inputs'
  );
});

test('test_inv_5: api_follows_hierarchy', () => {
  const appPath = path.resolve(process.cwd(), 'src/app.ts');
  const appContent = fs.readFileSync(appPath, 'utf8');

  assert.ok(appContent.includes('/api/public/'), 'Must have public APIs');
  assert.ok(appContent.includes('/api/partner/'), 'Must have partner APIs');
});

test('test_inv_6: rls_enabled_all_tables', () => {
  const tables = ['leads', 'partners', 'otp_challenges', 'audit_logs'];

  for (const table of tables) {
    const result = sh(
      `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
        `"SELECT relrowsecurity FROM pg_class WHERE relname='${table}';" 2>&1`
    ).trim();

    assert.equal(result, 't', `Table ${table} must have RLS enabled`);
  }
});

test('test_inv_7: otp_never_plaintext', () => {
  const result = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
      `"SELECT column_name FROM information_schema.columns WHERE table_name='otp_challenges';" 2>&1`
  );

  assert.ok(result.includes('otp_hash'), 'Must store OTP as hash');
  assert.ok(!result.includes('otp\n'), 'Must NOT store OTP in plaintext');
});
