/**
 * QUO-07: Quote immutability – frozen quotes cannot be modified
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { updateQuote } from '../services/quote-update';
import { submitQuote } from '../services/quote-submit';
import { approveQuote } from '../services/quote-approval';
import { createQuote } from '../services/quote-create';
import { configureSystem } from '../services/system-config';
import { updateFinancialConfig } from '../services/financial-config';
import { createCatalogItem } from '../services/catalog';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { createUser } from '../services/users';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase, withOrgContext } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

async function createImmutabilitySetup(orgId: string) {
  await updateFinancialConfig(orgId, {
    block_gross_margin: -100,
    block_net_margin: -100,
  });

  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-IMMUT-${Date.now()}`,
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
    sku: `INV-IMMUT-${Date.now()}`,
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

  return { project, quote };
}

test('test_quo07_1: cannot_update_approved_quote', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createImmutabilitySetup(orgId);

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

  const admin = await createUser(orgId, {
    email: `admin-immut-${Date.now()}@test.com`,
    password: 'p',
    full_name: 'Admin',
    role: 'ADMIN',
  });

  await approveQuote(orgId, quote.id as string, admin.id);

  await assert.rejects(
    async () => {
      await updateQuote(orgId, quote.id as string, {
        customer_name: 'New Name',
      });
    },
    (error: Error) => {
      assert.ok(
        error.message.includes('DRAFT') || error.message.includes('frozen')
      );
      return true;
    }
  );
});

test('test_quo07_2: cannot_update_sent_quote', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createImmutabilitySetup(orgId);

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE quotes SET status = 'SENT' WHERE id = $1`,
      [quote.id]
    );
  });

  await assert.rejects(
    async () => {
      await updateQuote(orgId, quote.id as string, {
        customer_name: 'New Name',
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('DRAFT'));
      return true;
    }
  );
});

test('test_quo07_3: financial_snapshot_unchanged_after_approval', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createImmutabilitySetup(orgId);

  const originalSnapshot = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT financial_snapshot FROM quotes WHERE id = $1`,
      [quote.id]
    );
    const snap = r.rows[0]?.financial_snapshot;
    return typeof snap === 'string' ? JSON.parse(snap || '{}') : snap ?? {};
  });

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE quotes SET status = 'APPROVED' WHERE id = $1`,
      [quote.id]
    );
  });

  const approvedQuote = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT financial_snapshot FROM quotes WHERE id = $1`,
      [quote.id]
    );
    const snap = result.rows[0]?.financial_snapshot;
    return typeof snap === 'string' ? JSON.parse(snap || '{}') : snap ?? {};
  });

  assert.deepEqual(approvedQuote, originalSnapshot);
});

test('test_quo07_4: can_update_draft_quote', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createImmutabilitySetup(orgId);

  const updated = await updateQuote(orgId, quote.id as string, {
    customer_name: 'Updated Name',
  });

  assert.equal(updated.customer_name, 'Updated Name');
});

test('test_quo07_5: line_items_preserved_on_approve', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createImmutabilitySetup(orgId);

  const lineItemsBefore = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT COUNT(*) as count FROM quote_line_items WHERE quote_id = $1`,
      [quote.id]
    );
    return parseInt(result.rows[0].count as string, 10);
  });

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE quotes SET status = 'APPROVED' WHERE id = $1`,
      [quote.id]
    );
  });

  const lineItemsAfter = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT COUNT(*) as count FROM quote_line_items WHERE quote_id = $1`,
      [quote.id]
    );
    return parseInt(result.rows[0].count as string, 10);
  });

  assert.equal(lineItemsBefore, lineItemsAfter);
});
