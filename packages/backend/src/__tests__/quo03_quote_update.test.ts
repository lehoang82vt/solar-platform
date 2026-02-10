/**
 * QUO-03: Quote update – DRAFT only, recalculate new version, get with line items
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuote } from '../services/quote-create';
import { updateQuote, getQuote } from '../services/quote-update';
import { configureSystem } from '../services/system-config';
import { createCatalogItem } from '../services/catalog';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase, withOrgContext } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

async function createUpdateSetup(orgId: string) {
  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-UPDATE-${Date.now()}`,
    brand: 'Test',
    model: 'Test Module',
    power_watt: 550,
    voc: 50,
    vmp: 90,
    isc: 7,
    imp: 2,
    efficiency: 21,
    sell_price_vnd: 3000000,
  });

  const inverter = await createCatalogItem(orgId, 'inverters', {
    sku: `INV-UPDATE-${Date.now()}`,
    brand: 'Test',
    model: 'Test Inverter',
    inverter_type: 'STRING',
    power_watt: 10000,
    max_dc_voltage: 800,
    mppt_count: 10,
    sell_price_vnd: 15000000,
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

test('test_quo03_1: update_draft_quote_succeeds', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createUpdateSetup(orgId);

  const updated = await updateQuote(orgId, quote.id as string, {
    customer_name: 'Updated Name',
    notes: 'Updated notes',
  });

  assert.equal(updated.customer_name, 'Updated Name');
  assert.equal(updated.notes, 'Updated notes');
});

test('test_quo03_2: recalculate_creates_new_version', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createUpdateSetup(orgId);

  const updated = await updateQuote(orgId, quote.id as string, {
    recalculate: true,
  });

  assert.equal(updated.version, 2);
  assert.ok(updated.id !== quote.id);
});

test('test_quo03_3: non_draft_quote_cannot_update', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createUpdateSetup(orgId);

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE quotes SET status = 'SENT' WHERE id = $1`,
      [quote.id]
    );
  });

  await assert.rejects(
    async () => {
      await updateQuote(orgId, quote.id as string, {
        customer_name: 'Test',
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('DRAFT'));
      return true;
    }
  );
});

test('test_quo03_4: get_quote_returns_with_line_items', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createUpdateSetup(orgId);

  const retrieved = await getQuote(orgId, quote.id as string);

  assert.ok(retrieved.line_items);
  assert.ok((retrieved.line_items as unknown[]).length > 0);
});

test('test_quo03_5: update_without_changes_returns_quote', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createUpdateSetup(orgId);

  const updated = await updateQuote(orgId, quote.id as string, {});

  assert.equal(updated.id, quote.id);
});
