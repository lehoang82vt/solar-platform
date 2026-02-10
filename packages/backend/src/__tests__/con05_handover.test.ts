/**
 * CON-05: Handover management with commission hold.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext, getDatabasePool } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createContractFromQuote } from '../services/contract-create';
import { signContract } from '../services/contract-lifecycle';
import {
  createInstallationHandover,
  cancelHandover,
  isCommissionBlocked,
  isCommissionReleased,
  COMMISSION_HOLD_DAYS_EXPORT,
} from '../services/handover';

test.before(async () => {
  await connectDatabase();
  const pool = getDatabasePool();
  if (pool) {
    await pool.query('ALTER TABLE handovers ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ');
  }
});

async function createSignedContract(orgId: string): Promise<string> {
  const { quoteId } = await withOrgContext(orgId, async (client) => {
    const proj = await client.query(
      `INSERT INTO projects (organization_id, customer_name, customer_phone, customer_email, customer_address)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orgId, 'Con05 Customer', '+84905555555', 'con05@test.local', 'HCM']
    );
    const projectId = (proj.rows[0] as { id: string }).id;
    const quoteNumber = `Q-CON05-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const quote = await client.query(
      `INSERT INTO quotes (organization_id, project_id, quote_number, status, customer_name, customer_phone, customer_email, total_vnd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [orgId, projectId, quoteNumber, 'CUSTOMER_ACCEPTED', 'Con05 Customer', '+84905555555', 'con05@test.local', 85_000_000]
    );
    return { quoteId: (quote.rows[0] as { id: string }).id };
  });
  const result = await createContractFromQuote(orgId, quoteId, {});
  assert.equal(result.kind, 'ok');
  const contractId = result.kind === 'ok' ? result.contract.id : '';
  await signContract(orgId, contractId, { customer_signed: true });
  await signContract(orgId, contractId, { company_signed_by: 'user-con05' });
  return contractId;
}

test('con05_1: create_installation_handover', async () => {
  const orgId = await getDefaultOrganizationId();
  const contractId = await createSignedContract(orgId);
  const handoverDate = new Date().toISOString().slice(0, 10);

  const result = await createInstallationHandover(orgId, contractId, {
    handover_date: handoverDate,
    notes: 'Installation complete',
  });

  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') {
    assert.equal(result.handover.handover_type, 'INSTALLATION');
    assert.ok(result.handover.handover_date, 'handover_date set');
    assert.equal(result.handover.contract_id, contractId);
    assert.equal(result.handover.notes, 'Installation complete');
  }
});

test('con05_2: handover_completes_contract', async () => {
  const orgId = await getDefaultOrganizationId();
  const contractId = await createSignedContract(orgId);
  const handoverDate = new Date().toISOString().slice(0, 10);

  await createInstallationHandover(orgId, contractId, { handover_date: handoverDate });

  const contract = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT status FROM contracts WHERE id = $1 AND organization_id = $2`,
      [contractId, orgId]
    );
    return r.rows[0] as { status: string } | undefined;
  });
  assert.ok(contract);
  assert.equal(contract!.status, 'COMPLETED');
});

test('con05_3: commission_held_7_days', async () => {
  const orgId = await getDefaultOrganizationId();
  const contractId = await createSignedContract(orgId);
  const handoverDate = new Date().toISOString().slice(0, 10);

  const result = await createInstallationHandover(orgId, contractId, { handover_date: handoverDate });
  assert.equal(result.kind, 'ok');
  if (result.kind !== 'ok') return;

  assert.equal(COMMISSION_HOLD_DAYS_EXPORT, 7);
  assert.equal(isCommissionReleased(result.handover), false);
});

test('con05_4: cancel_within_7_days_blocks_commission', async () => {
  const orgId = await getDefaultOrganizationId();
  const contractId = await createSignedContract(orgId);
  const handoverDate = new Date().toISOString().slice(0, 10);

  const create = await createInstallationHandover(orgId, contractId, { handover_date: handoverDate });
  assert.equal(create.kind, 'ok');
  const handoverId = create.kind === 'ok' ? create.handover.id : '';

  const cancel = await cancelHandover(orgId, handoverId);
  assert.equal(cancel.kind, 'ok');
  const handover = cancel.kind === 'ok' ? cancel.handover : null;
  assert.ok(handover);
  assert.ok(handover!.cancelled_at);
  assert.equal(isCommissionBlocked(handover!), true);
  assert.equal(isCommissionReleased(handover!), false);
});

test('con05_5: cancel_after_7_days_releases_commission', async () => {
  const orgId = await getDefaultOrganizationId();
  const contractId = await createSignedContract(orgId);
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 10);
  const handoverDate = pastDate.toISOString().slice(0, 10);

  const create = await createInstallationHandover(orgId, contractId, { handover_date: handoverDate });
  assert.equal(create.kind, 'ok');
  const handoverId = create.kind === 'ok' ? create.handover.id : '';

  const cancel = await cancelHandover(orgId, handoverId);
  assert.equal(cancel.kind, 'ok');
  const handover = cancel.kind === 'ok' ? cancel.handover : null;
  assert.ok(handover);
  assert.ok(handover!.cancelled_at);
  assert.equal(isCommissionBlocked(handover!), false);
  assert.equal(isCommissionReleased(handover!), true);
});

test('con05_6: checklist_saved', async () => {
  const orgId = await getDefaultOrganizationId();
  const contractId = await createSignedContract(orgId);
  const handoverDate = new Date().toISOString().slice(0, 10);
  const checklist = { panels_installed: true, inverter_ok: true, meter_connected: true };

  const result = await createInstallationHandover(orgId, contractId, {
    handover_date: handoverDate,
    checklist,
  });

  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') {
    assert.ok(result.handover.checklist);
    assert.equal((result.handover.checklist as Record<string, unknown>).panels_installed, true);
    assert.equal((result.handover.checklist as Record<string, unknown>).inverter_ok, true);
  }
});

test('con05_7: photos_saved', async () => {
  const orgId = await getDefaultOrganizationId();
  const contractId = await createSignedContract(orgId);
  const handoverDate = new Date().toISOString().slice(0, 10);
  const photos = ['https://storage.example.com/ho1.jpg', 'https://storage.example.com/ho2.jpg'];

  const result = await createInstallationHandover(orgId, contractId, {
    handover_date: handoverDate,
    photos,
  });

  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') {
    assert.ok(Array.isArray(result.handover.photos));
    assert.equal(result.handover.photos.length, 2);
    assert.equal(result.handover.photos[0], photos[0]);
    assert.equal(result.handover.photos[1], photos[1]);
  }
});
