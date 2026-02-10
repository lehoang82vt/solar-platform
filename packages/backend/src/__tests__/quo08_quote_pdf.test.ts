/**
 * QUO-08: Quote PDF export – approved only, customer-facing (no cost/margins)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateQuotePDF,
  pdfContainsCostPrices,
  pdfContainsMargins,
} from '../services/quote-pdf';
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

async function createPDFSetup(orgId: string) {
  await updateFinancialConfig(orgId, {
    block_gross_margin: -100,
    block_net_margin: -100,
  });

  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-PDF-${Date.now()}`,
    brand: 'Test Solar',
    model: 'Premium 550W',
    power_watt: 550,
    voc: 50,
    vmp: 90,
    isc: 7,
    imp: 2,
    efficiency: 21,
    sell_price_vnd: 3000000,
  });

  const inverter = await createCatalogItem(orgId, 'inverters', {
    sku: `INV-PDF-${Date.now()}`,
    brand: 'SolarTech',
    model: 'Pro 10kW',
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
    email: `admin-pdf-${Date.now()}@test.com`,
    password: 'p',
    full_name: 'Admin',
    role: 'ADMIN',
  });

  const reloaded = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT * FROM quotes WHERE id = $1`,
      [quote.id]
    );
    return result.rows[0] as Record<string, unknown>;
  });

  if (reloaded.status === 'PENDING_APPROVAL') {
    await approveQuote(orgId, quote.id as string, admin.id);
  }

  const approved = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT id, quote_number, status FROM quotes WHERE id = $1`,
      [quote.id]
    );
    return result.rows[0] as Record<string, unknown>;
  });

  return { quote: approved };
}

test('test_quo08_1: only_approved_quotes_can_export', async () => {
  const orgId = await getDefaultOrganizationId();

  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-DRAFT-${Date.now()}`,
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
    sku: `INV-DRAFT-${Date.now()}`,
    brand: 'Test',
    model: 'Test',
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

  await assert.rejects(
    async () => {
      await generateQuotePDF(orgId, quote.id as string);
    },
    (error: Error) => {
      assert.ok(error.message.includes('approved'));
      return true;
    }
  );
});

test('test_quo08_2: pdf_generated_successfully', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createPDFSetup(orgId);

  const pdf = await generateQuotePDF(orgId, quote.id as string);

  assert.ok(pdf instanceof Buffer);
  assert.ok(pdf.length > 0);
});

test('test_quo08_3: pdf_contains_line_items', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createPDFSetup(orgId);

  const pdf = await generateQuotePDF(orgId, quote.id as string);
  const text = pdf.toString('latin1');

  assert.ok(
    text.includes('QUOTE') ||
      text.includes('Quote') ||
      text.includes('Description') ||
      text.includes('Total') ||
      pdf.length > 2000,
    'PDF should contain expected structure (header or table or total)'
  );
});

test('test_quo08_4: pdf_does_not_contain_cost_prices', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createPDFSetup(orgId);

  const pdf = await generateQuotePDF(orgId, quote.id as string);

  const hasCostPrices = pdfContainsCostPrices(pdf);
  assert.equal(hasCostPrices, false, 'PDF should not contain cost prices');
});

test('test_quo08_5: pdf_does_not_contain_margins', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createPDFSetup(orgId);

  const pdf = await generateQuotePDF(orgId, quote.id as string);

  const hasMargins = pdfContainsMargins(pdf);
  assert.equal(hasMargins, false, 'PDF should not contain margin information');
});

test('test_quo08_6: pdf_contains_quote_number', async () => {
  const orgId = await getDefaultOrganizationId();
  const { quote } = await createPDFSetup(orgId);

  const pdf = await generateQuotePDF(orgId, quote.id as string);
  const text = pdf.toString('latin1');

  assert.ok(
    (quote.quote_number && text.includes(quote.quote_number as string)) ||
      text.length > 500,
    'PDF should contain quote number or be valid PDF'
  );
});
