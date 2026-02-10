/**
 * QUO-06: Quote revision – new version, parent tracking, superseded
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuoteRevision } from '../services/quote-revision';
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

async function createRevisionSetup(orgId: string) {
  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-REV-${Date.now()}`,
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
    sku: `INV-REV-${Date.now()}`,
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

test('test_quo06_1: revision_increments_version', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createRevisionSetup(orgId);

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE quotes SET status = 'EXPIRED' WHERE id = $1`,
      [quote.id]
    );
  });

  const newQuote = await createQuoteRevision(orgId, quote.id as string);

  assert.equal(newQuote.version, 2);
});

test('test_quo06_2: revision_has_parent_reference', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createRevisionSetup(orgId);

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE quotes SET status = 'EXPIRED' WHERE id = $1`,
      [quote.id]
    );
  });

  const newQuote = await createQuoteRevision(orgId, quote.id as string);

  assert.equal(newQuote.parent_quote_id, quote.id);
});

test('test_quo06_3: old_quote_marked_superseded', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createRevisionSetup(orgId);

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE quotes SET status = 'EXPIRED' WHERE id = $1`,
      [quote.id]
    );
  });

  await createQuoteRevision(orgId, quote.id as string);

  const oldQuote = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT * FROM quotes WHERE id = $1`,
      [quote.id]
    );
    return result.rows[0] as Record<string, unknown>;
  });

  assert.equal(oldQuote.superseded, true);
});

test('test_quo06_4: cannot_revise_approved_quote', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createRevisionSetup(orgId);

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE quotes SET status = 'APPROVED' WHERE id = $1`,
      [quote.id]
    );
  });

  await assert.rejects(
    async () => {
      await createQuoteRevision(orgId, quote.id as string);
    },
    (error: Error) => {
      assert.ok(error.message.includes('revise'));
      return true;
    }
  );
});

test('test_quo06_5: can_revise_draft_quote', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createRevisionSetup(orgId);

  const newQuote = await createQuoteRevision(orgId, quote.id as string);

  assert.ok(newQuote.id !== quote.id);
  assert.equal(newQuote.version, 2);
});
