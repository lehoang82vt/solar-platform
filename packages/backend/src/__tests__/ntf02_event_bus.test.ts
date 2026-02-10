/**
 * NTF-02 Part 1+2: Event bus, notification handler, integration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { eventBus } from '../services/event-bus';
import '../services/notification-handler';
import { resolveRecipients } from '../services/recipient-resolver';
import { createLead } from '../services/leads';
import { createProjectFromLead } from '../services/projects-lead';
import { createQuote } from '../services/quote-create';
import { configureSystem } from '../services/system-config';
import { createCatalogItem } from '../services/catalog';
import { submitQuote } from '../services/quote-submit';
import { updateFinancialConfig } from '../services/financial-config';
import { createPartner } from '../services/partners';
import { recordCommissionPayment } from '../services/commissions';

test.before(async () => {
  await connectDatabase();
});

test('ntf02_1: emit_triggers_handler', async () => {
  let called = false;
  eventBus.on('lead.created', (ev) => {
    called = true;
    assert.equal(ev.type, 'lead.created');
    assert.ok(ev.organizationId);
    assert.ok(ev.data);
  });
  await eventBus.emit({
    type: 'lead.created',
    organizationId: '00000000-0000-0000-0000-000000000001',
    data: { phone: '+84900000001' },
  });
  assert.equal(called, true);
});

test('ntf02_2: creates_notification_log', async () => {
  const orgId = await getDefaultOrganizationId();
  const phone = `+8490${Date.now().toString().slice(-7)}`;

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE notification_templates SET active = true WHERE event_type = 'lead.created' AND channel = 'ZALO_ZNS' AND organization_id = $1`,
      [orgId]
    );
  });

  const before = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM notification_logs WHERE event_type = 'lead.created' AND recipient = $1`,
      [phone]
    );
    return r.rows[0]?.c ?? 0;
  });

  await eventBus.emit({
    type: 'lead.created',
    organizationId: orgId,
    data: { customer_phone: phone },
  });

  const after = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM notification_logs WHERE event_type = 'lead.created' AND recipient = $1`,
      [phone]
    );
    return r.rows[0]?.c ?? 0;
  });

  assert.ok(after >= 1, `Expected at least 1 log for recipient ${phone}, got ${after}`);
  assert.ok(after > before, 'Notification log should be created');
});

test('ntf02_3: resolves_recipients_correctly', async () => {
  const orgId = await getDefaultOrganizationId();

  const leadRecipients = await resolveRecipients(orgId, 'lead.created', { customer_phone: '+84901112222' });
  assert.deepEqual(leadRecipients, ['+84901112222']);

  const leadRecipientsAlt = await resolveRecipients(orgId, 'lead.created', { phone: '+84903334444' });
  assert.deepEqual(leadRecipientsAlt, ['+84903334444']);

  const empty = await resolveRecipients(orgId, 'lead.created', {});
  assert.equal(empty.length, 0);
});

test('ntf02_4: inactive_template_skips_notification', async () => {
  const orgId = await getDefaultOrganizationId();

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE notification_templates SET active = false WHERE event_type = 'lead.created' AND channel = 'ZALO_ZNS' AND organization_id = $1`,
      [orgId]
    );
  });

  const phone = `+8490${Date.now().toString().slice(-7)}`;
  const before = await withOrgContext(orgId, async (client) => {
    const r = await client.query(`SELECT COUNT(*)::int AS c FROM notification_logs WHERE recipient = $1`, [phone]);
    return r.rows[0]?.c ?? 0;
  });

  await eventBus.emit({
    type: 'lead.created',
    organizationId: orgId,
    data: { customer_phone: phone },
  });

  const after = await withOrgContext(orgId, async (client) => {
    const r = await client.query(`SELECT COUNT(*)::int AS c FROM notification_logs WHERE recipient = $1`, [phone]);
    return r.rows[0]?.c ?? 0;
  });

  assert.equal(after, before, 'Inactive template should not create notification log');

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE notification_templates SET active = true WHERE event_type = 'lead.created' AND channel = 'ZALO_ZNS' AND organization_id = $1`,
      [orgId]
    );
  });
});

test('ntf02_5: unknown_event_type_no_crash', async () => {
  const orgId = await getDefaultOrganizationId();
  await assert.doesNotReject(
    (eventBus as { emit: (e: { type: string; organizationId: string; data: Record<string, unknown> }) => Promise<void> }).emit({
      type: 'unknown.event.type',
      organizationId: orgId,
      data: {},
    })
  );
});

test('ntf02_6: lead_created_sales_and_partner_notified', async () => {
  const orgId = await getDefaultOrganizationId();
  const phone = `+8490${Date.now().toString().slice(-7)}`;

  await createLead(orgId, { phone });

  const count = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM notification_logs WHERE event_type = 'lead.created' AND recipient = $1`,
      [phone]
    );
    return r.rows[0]?.c ?? 0;
  });

  assert.ok(count >= 1, `Expected at least 1 notification log for lead phone ${phone}, got ${count}`);
});

test('ntf02_7: quote_approved_customer_notified', async () => {
  const orgId = await getDefaultOrganizationId();
  await updateFinancialConfig(orgId, {
    block_gross_margin: -100,
    block_net_margin: -100,
    warning_gross_margin: -100,
    warning_net_margin: -100,
    target_gross_margin: -100,
    target_net_margin: -100,
  });

  const pv = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-NTF-${Date.now()}`,
    brand: 'T',
    model: 'M',
    power_watt: 550,
    voc: 80,
    vmp: 90,
    isc: 7,
    imp: 2,
    efficiency: 21,
    sell_price_vnd: 3000000,
  });
  const inv = await createCatalogItem(orgId, 'inverters', {
    sku: `INV-NTF-${Date.now()}`,
    brand: 'T',
    model: 'M',
    inverter_type: 'STRING',
    power_watt: 15000,
    max_dc_voltage: 800,
    mppt_count: 10,
    sell_price_vnd: 15000000,
  });

  const phone = `+8490${Date.now().toString().slice(-7)}`;
  const lead = await createLead(orgId, { phone });
  const project = await createProjectFromLead(orgId, lead.id);
  await configureSystem(orgId, project.id, {
    pv_module_id: pv.id,
    panel_count: 20,
    inverter_id: inv.id,
  });
  const quote = await createQuote(orgId, { project_id: project.id });
  await submitQuote(orgId, quote.id as string);

  const count = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM notification_logs WHERE event_type = 'quote.approved' AND recipient = $1`,
      [phone]
    );
    return r.rows[0]?.c ?? 0;
  });

  assert.ok(count >= 1, `Expected at least 1 quote.approved notification for customer ${phone}, got ${count}`);
});

test('ntf02_8: commission_paid_partner_notified', async () => {
  const orgId = await getDefaultOrganizationId();
  const partnerPhone = `+8490${Date.now().toString().slice(-7)}`;
  const partner = await createPartner(orgId, {
    email: `ntf-partner-${Date.now()}@test.com`,
    password: 'test123',
    referral_code: `NTF_${Date.now()}`,
    name: 'NTF Partner',
    phone: partnerPhone,
  });

  const commissionId = 'a0000000-0000-0000-0000-000000000001';
  await recordCommissionPayment(orgId, 'system', commissionId, 100000, {
    partner_id: partner.id,
  });

  const count = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM notification_logs WHERE event_type = 'commission.paid' AND recipient = $1`,
      [partnerPhone]
    );
    return r.rows[0]?.c ?? 0;
  });

  assert.ok(count >= 1, `Expected at least 1 commission.paid notification for partner ${partnerPhone}, got ${count}`);
});
