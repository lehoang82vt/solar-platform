/**
 * CON-03: Contract lifecycle – sign (customer + company), transitions, cancel, timeline.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createContractFromQuote } from '../services/contract-create';
import {
  signContract,
  transitionContract,
  cancelContract,
  getContractTimeline,
  validateTransition,
  getContractByIdOrg037,
} from '../services/contract-lifecycle';

test.before(async () => {
  await connectDatabase();
});

async function createDraftContract(orgId: string): Promise<{ contractId: string; projectId: string }> {
  const { quoteId, projectId } = await withOrgContext(orgId, async (client) => {
    const proj = await client.query(
      `INSERT INTO projects (organization_id, customer_name, customer_phone, customer_email, customer_address)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orgId, 'Con03 Customer', '+84903333333', 'con03@test.local', 'HCM']
    );
    const projectId = (proj.rows[0] as { id: string }).id;
    const quoteNumber = `Q-CON03-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const quote = await client.query(
      `INSERT INTO quotes (organization_id, project_id, quote_number, status, customer_name, customer_phone, customer_email, total_vnd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [orgId, projectId, quoteNumber, 'CUSTOMER_ACCEPTED', 'Con03 Customer', '+84903333333', 'con03@test.local', 100_000_000]
    );
    const quoteId = (quote.rows[0] as { id: string }).id;
    return { quoteId, projectId };
  });
  const result = await createContractFromQuote(orgId, quoteId, {});
  assert.equal(result.kind, 'ok');
  const contractId = result.kind === 'ok' ? result.contract.id : '';
  return { contractId, projectId };
}

test('con03_1: sign_contract_customer_and_company', async () => {
  const orgId = await getDefaultOrganizationId();
  const { contractId } = await createDraftContract(orgId);

  const customerSign = await signContract(orgId, contractId, { customer_signed: true });
  assert.equal(customerSign.kind, 'ok');
  if (customerSign.kind === 'ok') {
    assert.ok(customerSign.contract.customer_signed_at);
    assert.equal(customerSign.contract.status, 'DRAFT');
  }

  const companySign = await signContract(orgId, contractId, { company_signed_by: 'user-con03-1' });
  assert.equal(companySign.kind, 'ok');
  if (companySign.kind === 'ok') {
    assert.ok(companySign.contract.company_signed_at);
    assert.equal(companySign.contract.status, 'SIGNED');
  }
});

test('con03_2: start_progress_signed_to_in_progress', async () => {
  const orgId = await getDefaultOrganizationId();
  const { contractId } = await createDraftContract(orgId);
  await signContract(orgId, contractId, { customer_signed: true });
  await signContract(orgId, contractId, { company_signed_by: 'user-con03-2' });

  const trans = await transitionContract(orgId, contractId, 'IN_PROGRESS');
  assert.equal(trans.kind, 'ok');
  if (trans.kind === 'ok') {
    assert.equal(trans.contract.status, 'IN_PROGRESS');
    assert.ok(trans.contract.actual_start_date);
  }
});

test('con03_3: complete_contract', async () => {
  const orgId = await getDefaultOrganizationId();
  const { contractId } = await createDraftContract(orgId);
  await signContract(orgId, contractId, { customer_signed: true });
  await signContract(orgId, contractId, { company_signed_by: 'user-con03-3' });
  await transitionContract(orgId, contractId, 'IN_PROGRESS');

  const complete = await transitionContract(orgId, contractId, 'COMPLETED');
  assert.equal(complete.kind, 'ok');
  if (complete.kind === 'ok') {
    assert.equal(complete.contract.status, 'COMPLETED');
    assert.ok(complete.contract.actual_completion_date);
  }
});

test('con03_4: cancel_with_reason_required', async () => {
  const orgId = await getDefaultOrganizationId();
  const { contractId: id1 } = await createDraftContract(orgId);
  const noReason = await cancelContract(orgId, id1, '');
  assert.equal(noReason.kind, 'reason_required');

  const { contractId: id2 } = await createDraftContract(orgId);
  const withReason = await cancelContract(orgId, id2, '  Customer withdrew  ');
  assert.equal(withReason.kind, 'ok');
  if (withReason.kind === 'ok') {
    assert.equal(withReason.contract.status, 'CANCELLED');
    assert.ok(withReason.contract.cancellation_reason?.includes('Customer withdrew'));
  }
});

test('con03_5: cannot_cancel_completed', async () => {
  const orgId = await getDefaultOrganizationId();
  const { contractId } = await createDraftContract(orgId);
  await signContract(orgId, contractId, { customer_signed: true });
  await signContract(orgId, contractId, { company_signed_by: 'user-con03-5' });
  await transitionContract(orgId, contractId, 'IN_PROGRESS');
  await transitionContract(orgId, contractId, 'COMPLETED');

  const cancel = await cancelContract(orgId, contractId, 'Some reason');
  assert.equal(cancel.kind, 'invalid_state');
  if (cancel.kind === 'invalid_state') {
    assert.equal(cancel.status, 'COMPLETED');
  }
});

test('con03_6: state_transitions_validated', async () => {
  assert.equal(validateTransition('SIGNED', 'IN_PROGRESS'), true);
  assert.equal(validateTransition('IN_PROGRESS', 'COMPLETED'), true);
  assert.equal(validateTransition('SIGNED', 'CANCELLED'), true);
  assert.equal(validateTransition('DRAFT', 'IN_PROGRESS'), false);
  assert.equal(validateTransition('COMPLETED', 'CANCELLED'), false);
});

test('con03_7: signatures_required_for_signed', async () => {
  const orgId = await getDefaultOrganizationId();
  const { contractId } = await createDraftContract(orgId);

  await signContract(orgId, contractId, { customer_signed: true });
  const afterCustomer = await getContractByIdOrg037(orgId, contractId);
  assert.ok(afterCustomer);
  assert.ok(afterCustomer!.customer_signed_at);
  assert.equal(afterCustomer!.status, 'DRAFT');

  await signContract(orgId, contractId, { company_signed_by: 'user-con03-7' });
  const afterCompany = await getContractByIdOrg037(orgId, contractId);
  assert.ok(afterCompany);
  assert.ok(afterCompany!.company_signed_at);
  assert.equal(afterCompany!.status, 'SIGNED');
});

test('con03_8: timeline_tracking', async () => {
  const orgId = await getDefaultOrganizationId();
  const { contractId } = await createDraftContract(orgId);

  let timeline = await getContractTimeline(orgId, contractId);
  assert.ok(timeline.contract);
  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].event, 'created');

  await signContract(orgId, contractId, { customer_signed: true });
  await signContract(orgId, contractId, { company_signed_by: 'user-con03-8' });
  timeline = await getContractTimeline(orgId, contractId);
  assert.ok(timeline.events.some((e) => e.event === 'customer_signed'));
  assert.ok(timeline.events.some((e) => e.event === 'company_signed'));

  await transitionContract(orgId, contractId, 'IN_PROGRESS');
  timeline = await getContractTimeline(orgId, contractId);
  assert.ok(timeline.events.some((e) => e.event === 'started'));

  await transitionContract(orgId, contractId, 'COMPLETED');
  timeline = await getContractTimeline(orgId, contractId);
  assert.ok(timeline.events.some((e) => e.event === 'completed'));
});
