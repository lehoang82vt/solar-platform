/**
 * PTN-03: Partner lead list (leads where first_touch_partner = referral_code).
 * Requires: DB, migrations 015 + 016, partner auth.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartner, listPartnerLeads } from '../services/partners';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createOTPChallenge, verifyOTP } from '../services/otp';
import { connectDatabase } from '../config/database';

function uniqueList(_prefix: string) {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    email: `list-${s}@test.com`,
    referral_code: `LIST_${s}`.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
  };
}

test.before(async () => {
  await connectDatabase();
});

test('test_ptn03_1: list_returns_array', async () => {
  const orgId = await getDefaultOrganizationId();
  const u = uniqueList('1');
  const partner = await createPartner(orgId, {
    email: u.email,
    password: 'pass',
    referral_code: u.referral_code,
    name: 'List Partner 1',
  });

  const leads = await listPartnerLeads(orgId, partner.referral_code);
  assert.ok(Array.isArray(leads));
});

test('test_ptn03_2: list_includes_lead_after_otp_verify', async () => {
  const orgId = await getDefaultOrganizationId();
  const u = uniqueList('2');
  const partner = await createPartner(orgId, {
    email: u.email,
    password: 'pass',
    referral_code: u.referral_code,
    name: 'List Partner 2',
  });

  const phone = `+8490${Date.now().toString().slice(-7)}`;
  const { otp } = await createOTPChallenge(orgId, phone);
  await verifyOTP(orgId, phone, otp, partner.referral_code);

  const leads = await listPartnerLeads(orgId, partner.referral_code);
  const byPhone = leads.filter((l) => l.phone === phone);
  assert.ok(byPhone.length >= 1);
  assert.equal(byPhone[0].status, 'RECEIVED');
});

test('test_ptn03_3: list_respects_limit', async () => {
  const orgId = await getDefaultOrganizationId();
  const u = uniqueList('3');
  const partner = await createPartner(orgId, {
    email: u.email,
    password: 'pass',
    referral_code: u.referral_code,
    name: 'List Partner 3',
  });

  const leads = await listPartnerLeads(orgId, partner.referral_code, { limit: 2 });
  assert.ok(leads.length <= 2);
});

test('test_ptn03_4: list_lead_has_id_phone_status_created_at', async () => {
  const orgId = await getDefaultOrganizationId();
  const u = uniqueList('4');
  const partner = await createPartner(orgId, {
    email: u.email,
    password: 'pass',
    referral_code: u.referral_code,
    name: 'List Partner 4',
  });
  const phone = `+8490${Date.now().toString().slice(-7)}`;
  const { otp } = await createOTPChallenge(orgId, phone);
  await verifyOTP(orgId, phone, otp, partner.referral_code);

  const leads = await listPartnerLeads(orgId, partner.referral_code);
  const lead = leads.find((l) => l.phone === phone);
  assert.ok(lead);
  assert.ok(lead.id);
  assert.equal(lead.phone, phone);
  assert.equal(lead.status, 'RECEIVED');
  assert.ok(lead.created_at);
});
