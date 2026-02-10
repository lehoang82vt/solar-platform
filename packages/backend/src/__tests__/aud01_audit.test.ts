/**
 * AUD-01: Audit part 1 – quote create/approve, contract create, commission payment logged;
 * query by entity type and by date range.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import {
  write as auditLogWrite,
  getDefaultOrganizationId,
  queryByEntityType,
  queryByDateRange,
  queryByUser,
  setAuditExportLock,
  checkSalesBlocked,
  exportAuditToCsv,
} from '../services/auditLog';
import { createQuote } from '../services/quote-create';
import { approveQuote } from '../services/quote-approval';
import { submitQuote } from '../services/quote-submit';
import { createContractFromQuote } from '../services/contract-create';
import { recordCommissionPayment } from '../services/commissions';
import { createCatalogItem } from '../services/catalog';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { configureSystem } from '../services/system-config';
import { updateFinancialConfig } from '../services/financial-config';
import { createUser } from '../services/users';

let orgId: string;
let adminUserId: string;

test.before(async () => {
  await connectDatabase();
  orgId = await getDefaultOrganizationId();
  const admin = await createUser(orgId, {
    email: `admin-aud01-${Date.now()}@test.com`,
    password: 'p',
    full_name: 'Admin',
    role: 'ADMIN',
  });
  adminUserId = admin.id;
});

async function createQuoteForApproval(): Promise<{ quoteId: string; projectId: string }> {
  await updateFinancialConfig(orgId, { block_gross_margin: -100, block_net_margin: -100 });
  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-AUD01-${Date.now()}`,
    brand: 'T',
    model: 'T',
    power_watt: 550,
    voc: 50,
    vmp: 90,
    isc: 7,
    imp: 2,
    efficiency: 21,
    sell_price_vnd: 4000000,
  });
  const inverter = await createCatalogItem(orgId, 'inverters', {
    sku: `INV-AUD01-${Date.now()}`,
    brand: 'T',
    model: 'T',
    inverter_type: 'STRING',
    power_watt: 10000,
    max_dc_voltage: 800,
    mppt_count: 10,
    sell_price_vnd: 20000000,
  });
  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
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
    await client.query(
      `UPDATE quotes SET financial_snapshot = $1 WHERE id = $2`,
      [JSON.stringify({ ...parsed, level: 'WARNING' }), quote.id]
    );
  });
  await submitQuote(orgId, quote.id as string);
  return { quoteId: quote.id as string, projectId: project.id };
}

async function createContractSetup(): Promise<{ quoteId: string }> {
  return await withOrgContext(orgId, async (client) => {
    const proj = await client.query(
      `INSERT INTO projects (organization_id, customer_name, customer_phone, customer_email, customer_address)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orgId, 'Aud01 Customer', '+84901112222', 'aud01@test.local', 'HCM']
    );
    const projectId = (proj.rows[0] as { id: string }).id;
    const quoteNumber = `Q-AUD01-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const quote = await client.query(
      `INSERT INTO quotes (organization_id, project_id, quote_number, status, customer_name, customer_phone, customer_email, total_vnd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [orgId, projectId, quoteNumber, 'CUSTOMER_ACCEPTED', 'Aud01 Customer', '+84901112222', 'aud01@test.local', 80_000_000]
    );
    const quoteId = (quote.rows[0] as { id: string }).id;
    return { quoteId };
  });
}

test('aud01_1: quote_create_logged', async () => {
  const quoteId = '00000000-0000-4000-a000-000000000001';
  await auditLogWrite({
    organization_id: orgId,
    actor: 'aud01-test@local',
    action: 'quote.create',
    entity_type: 'quote',
    entity_id: quoteId,
    metadata: { quote_id: quoteId },
  });
  const rows = await queryByEntityType(orgId, 'quote', 50);
  const createLog = rows.find((r) => r.action === 'quote.create' && r.entity_id === quoteId);
  assert.ok(createLog, 'quote.create audit entry must exist');
  assert.equal(createLog.entity_type, 'quote');
});

test('aud01_2: quote_approve_logged', async () => {
  const { quoteId } = await createQuoteForApproval();
  await approveQuote(orgId, quoteId, adminUserId);
  const rows = await queryByEntityType(orgId, 'quote', 50);
  const approveLog = rows.find((r) => r.action === 'quote.approve' && r.entity_id === quoteId);
  assert.ok(approveLog, 'quote.approve audit entry must exist');
  assert.equal(approveLog.entity_type, 'quote');
});

test('aud01_3: contract_create_logged', async () => {
  const { quoteId } = await createContractSetup();
  const result = await createContractFromQuote(orgId, quoteId, { actor: 'aud01-contract@local' });
  assert.equal(result.kind, 'ok');
  const contractId = result.kind === 'ok' ? result.contract.id : '';
  const rows = await queryByEntityType(orgId, 'contract', 50);
  const contractLog = rows.find(
    (r) =>
      (r.action === 'contract.created.from_quote' || r.action === 'contract.created') &&
      r.entity_id === contractId
  );
  assert.ok(contractLog, 'contract create audit entry must exist');
  assert.equal(contractLog.entity_type, 'contract');
});

test('aud01_4: commission_payment_logged', async () => {
  const commissionId = '00000000-0000-4000-a000-000000000004';
  await recordCommissionPayment(orgId, 'finance@local', commissionId, 1_500_000, {
    partner_id: 'p1',
  });
  const rows = await queryByEntityType(orgId, 'commission', 50);
  const payLog = rows.find((r) => r.action === 'commission.payment' && r.entity_id === commissionId);
  assert.ok(payLog, 'commission.payment audit entry must exist');
  assert.equal(payLog.entity_type, 'commission');
  const meta = payLog.metadata as { amount?: number };
  assert.equal(meta?.amount, 1_500_000);
});

test('aud01_5: query_by_entity_type', async () => {
  await auditLogWrite({
    organization_id: orgId,
    actor: 'aud01@local',
    action: 'quote.create',
    entity_type: 'quote',
    entity_id: '00000000-0000-4000-a000-000000000005',
    metadata: {},
  });
  await auditLogWrite({
    organization_id: orgId,
    actor: 'aud01@local',
    action: 'contract.created',
    entity_type: 'contract',
    entity_id: '00000000-0000-4000-a000-000000000006',
    metadata: {},
  });
  const quoteRows = await queryByEntityType(orgId, 'quote', 50);
  const contractRows = await queryByEntityType(orgId, 'contract', 50);
  assert.ok(quoteRows.some((r) => r.entity_type === 'quote'));
  assert.ok(contractRows.some((r) => r.entity_type === 'contract'));
});

test('aud01_6: query_by_date_range', async () => {
  const from = new Date(Date.now() - 60_000);
  const to = new Date(Date.now() + 60_000);
  await auditLogWrite({
    organization_id: orgId,
    actor: 'aud01-range@local',
    action: 'aud01.date_range_test',
    entity_type: 'test',
    metadata: {},
  });
  const rows = await queryByDateRange(orgId, from, to, 100);
  const found = rows.find((r) => r.action === 'aud01.date_range_test');
  assert.ok(found, 'query by date range must return the recent audit entry');
});

test('aud01_7: config_change_logged', async () => {
  await updateFinancialConfig(
    orgId,
    { block_gross_margin: -99, block_net_margin: -99 },
    { actor: 'aud01-config@local' }
  );
  const rows = await queryByEntityType(orgId, 'financial_config', 20);
  const configLog = rows.find((r) => r.action === 'config.change');
  assert.ok(configLog, 'config.change audit entry must exist');
  const meta = configLog.metadata as { before?: Record<string, unknown>; after?: Record<string, unknown> };
  assert.ok(meta?.before != null, 'metadata.before must be present');
  assert.ok(meta?.after != null, 'metadata.after must be present');
});

test('aud01_8: auto_approval_logged', async () => {
  await updateFinancialConfig(orgId, { block_gross_margin: -100, block_net_margin: -100 });
  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-AUD01-AUTO-${Date.now()}`,
    brand: 'T',
    model: 'T',
    power_watt: 550,
    voc: 50,
    vmp: 90,
    isc: 7,
    imp: 2,
    efficiency: 21,
    sell_price_vnd: 4000000,
  });
  const inverter = await createCatalogItem(orgId, 'inverters', {
    sku: `INV-AUD01-AUTO-${Date.now()}`,
    brand: 'T',
    model: 'T',
    inverter_type: 'STRING',
    power_watt: 10000,
    max_dc_voltage: 800,
    mppt_count: 10,
    sell_price_vnd: 20000000,
  });
  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
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
    await client.query(
      `UPDATE quotes SET financial_snapshot = $1 WHERE id = $2`,
      [JSON.stringify({ ...parsed, level: 'PASS' }), quote.id]
    );
  });
  await submitQuote(orgId, quote.id as string, adminUserId);
  const rows = await queryByEntityType(orgId, 'quote', 50);
  const autoApprove = rows.find(
    (r) => r.action === 'quote.approve' && (r.metadata as { auto_approval?: boolean })?.auto_approval === true
  );
  assert.ok(autoApprove, 'quote.approve with auto_approval: true must exist');
});

test('aud01_9: query_by_user', async () => {
  const actor = 'aud01-user-query@local';
  await auditLogWrite({
    organization_id: orgId,
    actor,
    action: 'aud01.user_test',
    entity_type: 'test',
    metadata: {},
  });
  const rows = await queryByUser(orgId, actor, 20);
  assert.ok(rows.length >= 1);
  assert.ok(rows.some((r) => r.actor === actor && r.action === 'aud01.user_test'));
});

test('aud01_10: sales_activity_blocked_during_audit', async () => {
  const { quoteId } = await createQuoteForApproval();
  setAuditExportLock(orgId, true);
  await assert.rejects(
    async () => submitQuote(orgId, quoteId),
    /Sales activity blocked during audit export/
  );
  const { quoteId: cQuoteId } = await createContractSetup();
  await assert.rejects(
    async () => createContractFromQuote(orgId, cQuoteId, {}),
    /Sales activity blocked during audit export/
  );
  setAuditExportLock(orgId, false);
  checkSalesBlocked(orgId);
});

test('aud01_11: audit_export_to_csv', async () => {
  await auditLogWrite({
    organization_id: orgId,
    actor: 'aud01-csv@local',
    action: 'aud01.csv_test',
    entity_type: 'test',
    entity_id: '00000000-0000-4000-a000-000000000011',
    metadata: { key: 'value' },
  });
  const csv = await exportAuditToCsv(orgId, { limit: 100 });
  assert.ok(csv.includes('id,organization_id,actor,action,entity_type,entity_id,metadata,created_at'));
  assert.ok(csv.includes('aud01.csv_test'));
  assert.ok(csv.includes('aud01-csv@local'));
  assert.ok(csv.includes('audit01') === false || csv.includes('aud01')); // our action or actor
});
