/**
 * PTN-02: Partner dashboard (leads count by referral_code).
 * Requires: DB, migrations 015 + 016, partner auth.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPartner,
  loginPartner,
  getPartnerDashboard,
} from '../services/partners';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createOTPChallenge, verifyOTP } from '../services/otp';
import { connectDatabase } from '../config/database';

function uniqueRef(_prefix: string) {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    email: `dash-${s}@test.com`,
    referral_code: `DASH_${s}`.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
  };
}

test.before(async () => {
  await connectDatabase();
});

test('test_ptn02_1: dashboard_returns_leads_count', async () => {
  const orgId = await getDefaultOrganizationId();
  const u = uniqueRef('1');
  const partner = await createPartner(orgId, {
    email: u.email,
    password: 'pass',
    referral_code: u.referral_code,
    name: 'Dashboard Partner 1',
  });

  const dashboard = await getPartnerDashboard(orgId, partner.referral_code);
  assert.ok(typeof dashboard.leads_count === 'number');
  assert.equal(dashboard.referral_code, u.referral_code);
});

test('test_ptn02_2: dashboard_count_increases_after_lead_created', async () => {
  const orgId = await getDefaultOrganizationId();
  const u = uniqueRef('2');
  const partner = await createPartner(orgId, {
    email: u.email,
    password: 'pass',
    referral_code: u.referral_code,
    name: 'Dashboard Partner 2',
  });

  const before = await getPartnerDashboard(orgId, partner.referral_code);

  const phone = `+8490${Date.now().toString().slice(-7)}`;
  const { otp } = await createOTPChallenge(orgId, phone);
  await verifyOTP(orgId, phone, otp, partner.referral_code);

  const after = await getPartnerDashboard(orgId, partner.referral_code);
  assert.ok(after.leads_count >= before.leads_count + 1);
});

test('test_ptn02_3: dashboard_after_login_has_referral_code', async () => {
  const orgId = await getDefaultOrganizationId();
  const u = uniqueRef('3');
  await createPartner(orgId, {
    email: u.email,
    password: 'pass',
    referral_code: u.referral_code,
    name: 'Dashboard Partner 3',
  });
  const loginResult = await loginPartner(orgId, {
    email: u.email,
    password: 'pass',
  });
  assert.ok(loginResult);
  const dashboard = await getPartnerDashboard(orgId, loginResult.partner.referral_code);
  assert.equal(dashboard.referral_code, u.referral_code);
});

test('test_ptn02_4: dashboard_zero_leads_for_new_partner', async () => {
  const orgId = await getDefaultOrganizationId();
  const u = uniqueRef('4');
  const partner = await createPartner(orgId, {
    email: u.email,
    password: 'pass',
    referral_code: u.referral_code,
    name: 'Dashboard Partner 4',
  });
  const dashboard = await getPartnerDashboard(orgId, partner.referral_code);
  assert.equal(dashboard.leads_count, 0);
});
