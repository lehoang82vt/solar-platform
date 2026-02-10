/**
 * QUO-02 Part 1: Quote creation with line items and financial validation
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuote } from '../services/quote-create';
import { configureSystem } from '../services/system-config';
import { createCatalogItem } from '../services/catalog';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase, withOrgContext } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

async function createQuoteSetup(orgId: string) {
  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-QUOTE-${Date.now()}`,
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
    sku: `INV-QUOTE-${Date.now()}`,
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

  return { module, inverter, project };
}

test('test_quo02_01: create_quote_succeeds', async () => {
  const orgId = await getDefaultOrganizationId();
  const { project } = await createQuoteSetup(orgId);

  const quote = await createQuote(orgId, { project_id: project.id });

  assert.ok(quote.id);
  assert.ok(quote.quote_number);
  assert.equal(quote.version, 1);
  assert.equal(quote.status, 'DRAFT');
});

test('test_quo02_02: blocked_config_prevents_quote', async () => {
  const orgId = await getDefaultOrganizationId();

  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-BLOCK-${Date.now()}`,
    brand: 'Test',
    model: 'Test',
    power_watt: 550,
    voc: 50,
    vmp: 90,
    isc: 7,
    imp: 2,
    efficiency: 21,
    sell_price_vnd: 3000000,
  });

  const inverter = await createCatalogItem(orgId, 'inverters', {
    sku: `INV-BLOCK-${Date.now()}`,
    brand: 'Test',
    model: 'Test',
    inverter_type: 'STRING',
    power_watt: 3000, // Low power → DC/AC ratio BLOCK
    max_dc_voltage: 800,
    mppt_count: 10,
    sell_price_vnd: 10000000,
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

  await assert.rejects(
    async () => {
      await createQuote(orgId, { project_id: project.id });
    },
    (error: Error) => {
      assert.ok(error.message.includes('BLOCK'));
      return true;
    }
  );
});

test('test_quo02_03: quote_has_line_items', async () => {
  const orgId = await getDefaultOrganizationId();
  const { project } = await createQuoteSetup(orgId);

  const quote = await createQuote(orgId, { project_id: project.id });

  assert.ok(quote.line_items);
  assert.ok(
    (quote.line_items as unknown[]).length >= 3,
    'PV, Inverter, Labor minimum'
  );
});

test('test_quo02_04: quote_has_financial_snapshot', async () => {
  const orgId = await getDefaultOrganizationId();
  const { project } = await createQuoteSetup(orgId);

  const quote = await createQuote(orgId, { project_id: project.id });

  assert.ok(quote.financial_snapshot);
  const snap = quote.financial_snapshot as Record<string, unknown>;
  assert.ok(snap.equipment_cost);
  assert.ok(snap.labor_cost);
  assert.ok(typeof snap.gross_margin_pct === 'number');
});

test('test_quo02_05: line_items_saved_to_database', async () => {
  const orgId = await getDefaultOrganizationId();
  const { project } = await createQuoteSetup(orgId);

  const quote = await createQuote(orgId, { project_id: project.id });

  const result = await withOrgContext(orgId, async (client) => {
    return await client.query(
      `SELECT * FROM quote_line_items WHERE quote_id = $1 ORDER BY line_order`,
      [quote.id]
    );
  });

  assert.ok(result.rows.length >= 3);
  assert.equal(result.rows[0].item_type, 'PV_MODULE');
});

test('test_quo02_06: quote_has_version_number', async () => {
  const orgId = await getDefaultOrganizationId();
  const { project } = await createQuoteSetup(orgId);

  const quote = await createQuote(orgId, { project_id: project.id });

  assert.equal(quote.version, 1);
});

test('test_quo02_07: quote_has_default_status', async () => {
  const orgId = await getDefaultOrganizationId();
  const { project } = await createQuoteSetup(orgId);

  const quote = await createQuote(orgId, { project_id: project.id });

  assert.equal(quote.status, 'DRAFT');
});

test('test_quo02_08: quote_has_created_at', async () => {
  const orgId = await getDefaultOrganizationId();
  const { project } = await createQuoteSetup(orgId);

  const quote = await createQuote(orgId, { project_id: project.id });

  assert.ok(quote.created_at);
  const createdAt = new Date(quote.created_at as string);
  assert.ok(createdAt.getTime() > 0);
});

test('test_quo02_09: quote_belongs_to_organization', async () => {
  const orgId = await getDefaultOrganizationId();
  const { project } = await createQuoteSetup(orgId);

  const quote = await createQuote(orgId, { project_id: project.id });

  assert.equal(quote.organization_id, orgId);
});

test('test_quo02_10: quote_belongs_to_project', async () => {
  const orgId = await getDefaultOrganizationId();
  const { project } = await createQuoteSetup(orgId);

  const quote = await createQuote(orgId, { project_id: project.id });

  assert.equal(quote.project_id, project.id);
});
