/**
 * PRO-01: Profit gate enforcement – BLOCK / WARNING / super_admin bypass.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import {
  checkGate,
  checkGateWithAudit,
  enforceQuoteSubmitGate,
  enforceQuoteApproveGate,
  enforceContractCreateGate,
} from '../services/profit-gate';

test.before(async () => {
  await connectDatabase();
});

test('pro01_1: block_quote_submit_rejected', () => {
  const result = checkGate('BLOCK', { userRole: 'SALES' });
  assert.equal(result.allowed, false);
  assert.ok(result.reason?.includes('BLOCK'));
  assert.equal(result.bypassed, undefined);
});

test('pro01_2: block_quote_approve_rejected', () => {
  const result = checkGate('BLOCK', { userRole: 'ADMIN' });
  assert.equal(result.allowed, false);
  assert.ok(result.reason?.includes('BLOCK'));
});

test('pro01_3: block_contract_create_rejected', () => {
  assert.throws(
    () => enforceContractCreateGate('BLOCK', { userRole: 'SALES' }),
    (err: Error) => err.message.includes('BLOCK')
  );
});

test('pro01_4: warning_quote_submit_allowed', () => {
  const result = checkGate('WARNING', { userRole: 'SALES' });
  assert.equal(result.allowed, true);
  assert.equal(result.bypassed, undefined);
});

test('pro01_5: warning_shows_alert', () => {
  const result = checkGate('WARNING');
  assert.equal(result.allowed, true);
  assert.ok(result.alert);
  assert.ok(result.alert?.includes('WARNING'));
});

test('pro01_6: super_admin_bypasses_block_submit', () => {
  const result = checkGate('BLOCK', { userRole: 'super_admin' });
  assert.equal(result.allowed, true);
  assert.equal(result.bypassed, true);
  assert.doesNotThrow(() => enforceQuoteSubmitGate('BLOCK', { userRole: 'super_admin' }));
});

test('pro01_7: super_admin_bypasses_block_approve', () => {
  const result = checkGate('BLOCK', { userRole: 'super_admin' });
  assert.equal(result.allowed, true);
  assert.equal(result.bypassed, true);
  assert.doesNotThrow(() => enforceQuoteApproveGate('BLOCK', { userRole: 'super_admin' }));
});

test('pro01_8: super_admin_bypasses_block_contract', () => {
  assert.doesNotThrow(() => enforceContractCreateGate('BLOCK', { userRole: 'super_admin' }));
  const result = checkGate('BLOCK', { userRole: 'super_admin' });
  assert.equal(result.allowed, true);
  assert.equal(result.bypassed, true);
});

test('pro01_9: audit_log_records_bypass', async () => {
  const orgId = await getDefaultOrganizationId();
  const userId = 'audit-bypass-user';
  const entityId = '00000000-0000-4000-a000-000000000009'; // valid UUID for test

  const result = await checkGateWithAudit('BLOCK', {
    userRole: 'super_admin',
    organizationId: orgId,
    userId,
    action: 'quote.submit',
    entityType: 'quote',
    entityId,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.bypassed, true);

  const rows = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT action, entity_type, entity_id, metadata FROM audit_logs
       WHERE action = 'profit_gate.bypass' AND entity_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [entityId]
    );
    return r.rows;
  });

  assert.equal(rows.length, 1);
  const row = rows[0] as { action: string; entity_type: string; entity_id: string; metadata: Record<string, unknown> };
  assert.equal(row.action, 'profit_gate.bypass');
  assert.equal(row.entity_type, 'quote');
  assert.equal(row.entity_id, entityId);
  assert.equal((row.metadata?.action as string), 'quote.submit');
});
