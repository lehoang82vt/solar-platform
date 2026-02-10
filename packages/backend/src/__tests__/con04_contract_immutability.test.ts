/**
 * CON-04: Contract immutability – update allowed only when DRAFT.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createContractFromQuote } from '../services/contract-create';
import { signContract, transitionContract, updateContract } from '../services/contract-lifecycle';
import { withOrgContext } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

async function createDraftContract(orgId: string): Promise<string> {
  const { quoteId } = await withOrgContext(orgId, async (client) => {
    const proj = await client.query(
      `INSERT INTO projects (organization_id, customer_name, customer_phone, customer_email, customer_address)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orgId, 'Con04 Customer', '+84904444444', 'con04@test.local', 'HCM']
    );
    const projectId = (proj.rows[0] as { id: string }).id;
    const quoteNumber = `Q-CON04-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const quote = await client.query(
      `INSERT INTO quotes (organization_id, project_id, quote_number, status, customer_name, customer_phone, customer_email, total_vnd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [orgId, projectId, quoteNumber, 'CUSTOMER_ACCEPTED', 'Con04 Customer', '+84904444444', 'con04@test.local', 90_000_000]
    );
    return { quoteId: (quote.rows[0] as { id: string }).id };
  });
  const result = await createContractFromQuote(orgId, quoteId, {});
  assert.equal(result.kind, 'ok');
  return result.kind === 'ok' ? result.contract.id : '';
}

test('con04_1: cannot_update_signed_contract', async () => {
  const orgId = await getDefaultOrganizationId();
  const contractId = await createDraftContract(orgId);
  await signContract(orgId, contractId, { customer_signed: true });
  await signContract(orgId, contractId, { company_signed_by: 'user-con04-1' });

  const result = await updateContract(orgId, contractId, { notes: 'Should be rejected' });
  assert.equal(result.kind, 'locked');
  if (result.kind === 'locked') {
    assert.equal(result.status, 'SIGNED');
  }
});

test('con04_2: cannot_update_in_progress', async () => {
  const orgId = await getDefaultOrganizationId();
  const contractId = await createDraftContract(orgId);
  await signContract(orgId, contractId, { customer_signed: true });
  await signContract(orgId, contractId, { company_signed_by: 'user-con04-2' });
  await transitionContract(orgId, contractId, 'IN_PROGRESS');

  const result = await updateContract(orgId, contractId, { notes: 'Should be rejected' });
  assert.equal(result.kind, 'locked');
  if (result.kind === 'locked') {
    assert.equal(result.status, 'IN_PROGRESS');
  }
});

test('con04_3: can_update_draft', async () => {
  const orgId = await getDefaultOrganizationId();
  const contractId = await createDraftContract(orgId);

  const result = await updateContract(orgId, contractId, {
    notes: 'Draft notes',
    expected_start_date: '2025-03-01',
    expected_completion_date: '2025-04-15',
  });
  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') {
    assert.equal(result.contract.notes, 'Draft notes');
    assert.ok(result.contract.expected_start_date, 'expected_start_date set');
    assert.ok(result.contract.expected_completion_date, 'expected_completion_date set');
  }
});
