/**
 * QUO-05: Admin approve/reject pending quotes
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveQuote,
  rejectQuote,
  getPendingQuotes,
  isQuoteFrozen,
} from '../services/quote-approval';
import { submitQuote } from '../services/quote-submit';
import { createQuote } from '../services/quote-create';
import { configureSystem } from '../services/system-config';
import { updateFinancialConfig } from '../services/financial-config';
import { createCatalogItem } from '../services/catalog';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createUser } from '../services/users';
import { connectDatabase, withOrgContext } from '../config/database';

let adminUserId: string;

test.before(async () => {
  await connectDatabase();
  const orgId = await getDefaultOrganizationId();
  const admin = await createUser(orgId, {
    email: `admin-quo05-${Date.now()}@test.com`,
    password: 'p',
    full_name: 'Admin',
    role: 'ADMIN',
  });
  adminUserId = admin.id;
});

async function createApprovalSetup(orgId: string) {
  await updateFinancialConfig(orgId, {
    block_gross_margin: -100,
    block_net_margin: -100,
  });

  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-APPROVE-${Date.now()}`,
    brand: 'Test',
    model: 'Test Module',
    power_watt: 550,
    voc: 50,
    vmp: 90,
    isc: 7,
    imp: 2,
    efficiency: 21,
    sell_price_vnd: 4000000,
  });

  const inverter = await createCatalogItem(orgId, 'inverters', {
    sku: `INV-APPROVE-${Date.now()}`,
    brand: 'Test',
    model: 'Test Inverter',
    inverter_type: 'STRING',
    power_watt: 10000,
    max_dc_voltage: 800,
    mppt_count: 10,
    sell_price_vnd: 20000000,
  });

  const lead = await createLead(orgId, {
    phone: `+8490${Date.now().toString().slice(-7)}`,
  });
  const project = await createProjectFromLead(orgId, lead.id);

  await configureSystem(orgId, project.id, {
    pv_module_id: module.id,
    panel_count: 20,
    inverter_id: inverter.id,
  });

  const quote = await createQuote(orgId, { project_id: project.id });

  await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT financial_snapshot FROM quotes WHERE id = $1`,
      [quote.id]
    );
    const snap = r.rows[0]?.financial_snapshot;
    const parsed = typeof snap === 'string' ? JSON.parse(snap || '{}') : snap ?? {};
    const withWarning = { ...parsed, level: 'WARNING' };
    await client.query(
      `UPDATE quotes SET financial_snapshot = $1 WHERE id = $2`,
      [JSON.stringify(withWarning), quote.id]
    );
  });

  await submitQuote(orgId, quote.id as string);

  const reloaded = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT * FROM quotes WHERE id = $1`,
      [quote.id]
    );
    return result.rows[0] as Record<string, unknown>;
  });

  return { quote: reloaded };
}

test('test_quo05_1: approve_pending_quote_succeeds', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createApprovalSetup(orgId);

  assert.equal(quote.status, 'PENDING_APPROVAL', 'Setup should yield PENDING_APPROVAL');

  const approved = await approveQuote(orgId, quote.id as string, adminUserId);

  assert.equal(approved.status, 'APPROVED');
  assert.ok(approved.approved_by);
  assert.ok(approved.approved_at);
});

test('test_quo05_2: approved_quote_is_frozen', async () => {
  assert.equal(isQuoteFrozen('APPROVED'), true);
});

test('test_quo05_3: reject_pending_quote_succeeds', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createApprovalSetup(orgId);

  assert.equal(quote.status, 'PENDING_APPROVAL');

  const rejected = await rejectQuote(
    orgId,
    quote.id as string,
    adminUserId,
    'Pricing too low'
  );

  assert.equal(rejected.status, 'DRAFT');
  assert.ok((rejected.notes as string).includes('REJECTED'));
  assert.ok((rejected.notes as string).includes('Pricing too low'));
});

test('test_quo05_4: reject_requires_reason', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createApprovalSetup(orgId);

  assert.equal(quote.status, 'PENDING_APPROVAL');

  await assert.rejects(
    async () => {
      await rejectQuote(orgId, quote.id as string, adminUserId, '');
    },
    (error: Error) => {
      assert.ok(error.message.includes('required'));
      return true;
    }
  );
});

test('test_quo05_5: cannot_approve_non_pending', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createApprovalSetup(orgId);

  assert.equal(quote.status, 'PENDING_APPROVAL');
  await approveQuote(orgId, quote.id as string, adminUserId);

  await assert.rejects(
    async () => {
      await approveQuote(orgId, quote.id as string, adminUserId);
    },
    (error: Error) => {
      assert.ok(error.message.includes('PENDING'));
      return true;
    }
  );
});

test('test_quo05_6: get_pending_quotes_works', async () => {
  const orgId = await getDefaultOrganizationId();
  await createApprovalSetup(orgId);

  const pending = await getPendingQuotes(orgId);

  assert.ok(Array.isArray(pending));
});

test('test_quo05_7: sent_quote_is_frozen', async () => {
  assert.equal(isQuoteFrozen('SENT'), true);
});

test('test_quo05_8: draft_quote_is_not_frozen', async () => {
  assert.equal(isQuoteFrozen('DRAFT'), false);
});
