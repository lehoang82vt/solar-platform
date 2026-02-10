/**
 * CON-02: Create contract from approved quote.
 * Tests: create from accepted quote, requires accepted, deposit/final payment,
 * contract number, snapshot, default warranty, audit trail.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createContractFromQuote } from '../services/contract-create';

test.before(async () => {
  await connectDatabase();
});

/** Insert project and quote using 034 schema (project_id, total_vnd, customer_* on quote). */
async function insertProjectAndQuote(
  orgId: string,
  options: { status: string; priceTotal: number }
): Promise<{ quoteId: string; projectId: string }> {
  return await withOrgContext(orgId, async (client) => {
    const proj = await client.query(
      `INSERT INTO projects (organization_id, customer_name, customer_phone, customer_email, customer_address)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orgId, 'Con02 Customer', '+84901234567', 'con02@test.local', 'HCM']
    );
    const projectId = (proj.rows[0] as { id: string }).id;

    const quoteNumber = `Q-CON02-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const quote = await client.query(
      `INSERT INTO quotes (organization_id, project_id, quote_number, status, customer_name, customer_phone, customer_email, total_vnd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [orgId, projectId, quoteNumber, options.status, 'Con02 Customer', '+84901234567', 'con02@test.local', options.priceTotal]
    );
    const quoteId = (quote.rows[0] as { id: string }).id;

    return { quoteId, projectId };
  });
}

test('con02_1: create_from_accepted_quote', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quoteId } = await insertProjectAndQuote(orgId, {
    status: 'CUSTOMER_ACCEPTED',
    priceTotal: 100_000_000,
  });

  const result = await createContractFromQuote(orgId, quoteId, {});

  assert.equal(result.kind, 'ok');
  assert.ok(result.kind === 'ok' && result.contract.id);
  assert.equal(result.contract.status, 'DRAFT');
  assert.equal(result.contract.quote_id, quoteId);
  assert.equal(Number(result.contract.contract_value), 100_000_000);
});

test('con02_2: requires_accepted_quote', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quoteId } = await insertProjectAndQuote(orgId, {
    status: 'DRAFT',
    priceTotal: 50_000_000,
  });

  const result = await createContractFromQuote(orgId, quoteId, {});

  assert.equal(result.kind, 'quote_not_accepted');
  assert.ok(result.kind === 'quote_not_accepted' && result.status === 'DRAFT');
});

test('con02_3: deposit_calculated_correctly', async () => {
  const orgId = await getDefaultOrganizationId();
  const total = 200_000_000;
  const { quoteId } = await insertProjectAndQuote(orgId, {
    status: 'CUSTOMER_ACCEPTED',
    priceTotal: total,
  });

  const result = await createContractFromQuote(orgId, quoteId, {
    deposit_percentage: 40,
  });

  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') {
    assert.equal(result.contract.deposit_percentage, 40);
    assert.equal(result.contract.deposit_vnd, 80_000_000);
    assert.equal(result.contract.total_vnd, total);
  }
});

test('con02_4: final_payment_calculated', async () => {
  const orgId = await getDefaultOrganizationId();
  const total = 150_000_000;
  const { quoteId } = await insertProjectAndQuote(orgId, {
    status: 'CUSTOMER_ACCEPTED',
    priceTotal: total,
  });

  const result = await createContractFromQuote(orgId, quoteId, {
    deposit_percentage: 30,
  });

  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') {
    assert.equal(result.contract.deposit_vnd, 45_000_000);
    assert.equal(result.contract.final_payment_vnd, 105_000_000);
    assert.equal(
      result.contract.deposit_vnd + result.contract.final_payment_vnd,
      total
    );
  }
});

test('con02_5: contract_number_generated', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quoteId } = await insertProjectAndQuote(orgId, {
    status: 'CUSTOMER_ACCEPTED',
    priceTotal: 80_000_000,
  });

  const result = await createContractFromQuote(orgId, quoteId, {});

  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') {
    const num = result.contract.contract_number;
    assert.ok(/^C-\d+-[0-9a-f]{8}$/.test(num), `contract_number should match C-{timestamp}-{hex}: ${num}`);
  }
});

test('con02_6: snapshot_saved', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quoteId } = await insertProjectAndQuote(orgId, {
    status: 'CUSTOMER_ACCEPTED',
    priceTotal: 90_000_000,
  });

  const result = await createContractFromQuote(orgId, quoteId, {});

  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') {
    assert.ok(result.contract.customer_snapshot && typeof result.contract.customer_snapshot === 'object');
    assert.equal(result.contract.customer_snapshot.name, 'Con02 Customer');
    assert.ok(result.contract.financial_snapshot && typeof result.contract.financial_snapshot === 'object');
    assert.equal(result.contract.financial_snapshot.total_vnd, 90_000_000);
    assert.ok(Array.isArray(result.contract.payment_terms));
    assert.equal(result.contract.payment_terms.length, 2);
  }
});

test('con02_7: default_warranty_10_years', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quoteId } = await insertProjectAndQuote(orgId, {
    status: 'CUSTOMER_ACCEPTED',
    priceTotal: 70_000_000,
  });

  const result = await createContractFromQuote(orgId, quoteId, {});

  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') {
    assert.equal(result.contract.warranty_years, 10);
  }
});

test('con02_8: audit_trail_created', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quoteId } = await insertProjectAndQuote(orgId, {
    status: 'CUSTOMER_ACCEPTED',
    priceTotal: 60_000_000,
  });

  const result = await createContractFromQuote(orgId, quoteId, {
    actor: 'con02-audit-test@local',
  });

  assert.equal(result.kind, 'ok');
  if (result.kind !== 'ok') return;

  const auditResult = await withOrgContext(orgId, async (client) => {
    return await client.query(
      `SELECT action, entity_type, entity_id, metadata
       FROM audit_logs
       WHERE action = 'contract.created.from_quote' AND entity_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [result.contract.id]
    );
  });

  assert.equal(auditResult.rows.length, 1);
  const row = auditResult.rows[0] as { action: string; entity_type: string; entity_id: string; metadata: Record<string, unknown> };
  assert.equal(row.action, 'contract.created.from_quote');
  assert.equal(row.entity_type, 'contract');
  assert.equal(row.entity_id, result.contract.id);
  assert.equal((row.metadata as Record<string, unknown>).contract_number, result.contract.contract_number);
  assert.equal((row.metadata as Record<string, unknown>).quote_id, quoteId);
});
