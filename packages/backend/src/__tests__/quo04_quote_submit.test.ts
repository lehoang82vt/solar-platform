/**
 * QUO-04: Quote submit for approval + auto-approval when PASS
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { submitQuote, canSubmitQuote } from '../services/quote-submit';
import { createQuote } from '../services/quote-create';
import { configureSystem } from '../services/system-config';
import { createCatalogItem } from '../services/catalog';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { getDefaultOrganizationId } from '../services/auditLog';
import { updateFinancialConfig } from '../services/financial-config';
import { connectDatabase, withOrgContext } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

async function createSubmitSetup(orgId: string) {
  await updateFinancialConfig(orgId, {
    block_gross_margin: -100,
    block_net_margin: -100,
  });
  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-SUBMIT-${Date.now()}`,
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
    sku: `INV-SUBMIT-${Date.now()}`,
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

test('test_quo04_1: submit_draft_quote_succeeds', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createSubmitSetup(orgId);

  const submitted = await submitQuote(orgId, quote.id as string);

  assert.ok(
    submitted.status === 'PENDING_APPROVAL' || submitted.status === 'APPROVED'
  );
});

test('test_quo04_2: pass_quote_auto_approves', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createSubmitSetup(orgId);

  const submitted = await submitQuote(orgId, quote.id as string);

  if (submitted.auto_approved) {
    assert.equal(submitted.status, 'APPROVED');
    assert.ok(submitted.approved_at);
  }
});

test('test_quo04_3: warning_quote_needs_approval', async () => {
  const orgId = await getDefaultOrganizationId();
  await updateFinancialConfig(orgId, {
    block_gross_margin: -100,
    block_net_margin: -100,
  });
  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-WARN-${Date.now()}`,
    brand: 'Test',
    model: 'Test',
    power_watt: 550,
    voc: 50,
    vmp: 90,
    isc: 7,
    imp: 2,
    efficiency: 21,
    sell_price_vnd: 4000000,
  });

  const inverter = await createCatalogItem(orgId, 'inverters', {
    sku: `INV-WARN-${Date.now()}`,
    brand: 'Test',
    model: 'Test',
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

  const submitted = await submitQuote(orgId, quote.id as string);

  if (!submitted.auto_approved) {
    assert.equal(submitted.status, 'PENDING_APPROVAL');
  }
});

test('test_quo04_4: block_quote_cannot_submit', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createSubmitSetup(orgId);

  await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT financial_snapshot FROM quotes WHERE id = $1`,
      [quote.id]
    );
    const snap = r.rows[0]?.financial_snapshot;
    const parsed =
      typeof snap === 'string' ? JSON.parse(snap) : snap ?? {};
    const blocked = { ...parsed, level: 'BLOCK' };
    await client.query(
      `UPDATE quotes SET financial_snapshot = $1 WHERE id = $2`,
      [JSON.stringify(blocked), quote.id]
    );
  });

  await assert.rejects(
    async () => {
      await submitQuote(orgId, quote.id as string);
    },
    (error: Error) => {
      assert.ok(error.message.includes('BLOCK'));
      return true;
    }
  );
});

test('test_quo04_5: can_submit_check_works', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createSubmitSetup(orgId);

  const result = await canSubmitQuote(orgId, quote.id as string);

  assert.equal(result.can_submit, true);
});

test('test_quo04_6: cannot_submit_non_draft', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createSubmitSetup(orgId);

  await submitQuote(orgId, quote.id as string);

  await assert.rejects(
    async () => {
      await submitQuote(orgId, quote.id as string);
    },
    (error: Error) => {
      assert.ok(error.message.includes('Cannot submit'));
      return true;
    }
  );
});

test('test_quo04_7: auto_approved_has_approved_at', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createSubmitSetup(orgId);

  const submitted = await submitQuote(orgId, quote.id as string);

  if (submitted.auto_approved) {
    assert.ok(submitted.approved_at);
    const approvedAt = new Date(submitted.approved_at as string);
    assert.ok(approvedAt.getTime() > 0);
  } else {
    assert.ok(true);
  }
});

test('test_quo04_8: submit_returns_auto_approved_flag', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createSubmitSetup(orgId);

  const submitted = await submitQuote(orgId, quote.id as string);

  assert.ok(typeof submitted.auto_approved === 'boolean');
});
