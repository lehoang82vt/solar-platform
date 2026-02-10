/**
 * SRV-03: Electricity usage input
 * Server calculates night_kwh and storage_target_kwh; client cannot override.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { updateProjectUsage } from '../services/usage';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

test('test_srv03_1: valid_input_saves_usage', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: `+84902000${String(Date.now()).slice(-4)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const updated = await updateProjectUsage(orgId, project.id, {
    monthly_kwh: 500,
    day_usage_pct: 70,
  });

  assert.equal(updated.monthly_kwh, 500);
  assert.equal(Number(updated.day_usage_pct), 70);
});

test('test_srv03_2: server_calculates_night_kwh', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: `+84902001${String(Date.now()).slice(-4)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const updated = await updateProjectUsage(orgId, project.id, {
    monthly_kwh: 500,
    day_usage_pct: 70,
  });

  const nightKwh = Number(updated.night_kwh);
  assert.ok(Math.abs(nightKwh - 150) < 0.01, `Expected ~150, got ${nightKwh}`);
});

test('test_srv03_3: server_calculates_storage_target', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: `+84902002${String(Date.now()).slice(-4)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const updated = await updateProjectUsage(orgId, project.id, {
    monthly_kwh: 500,
    day_usage_pct: 70,
  });

  const storageTarget = Number(updated.storage_target_kwh);
  assert.ok(Math.abs(storageTarget - 120) < 0.01, `Expected ~120, got ${storageTarget}`);
});

test('test_srv03_4: client_cannot_send_night_kwh', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: `+84902003${String(Date.now()).slice(-4)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const updated = await updateProjectUsage(orgId, project.id, {
    monthly_kwh: 500,
    day_usage_pct: 70,
  });

  const nightKwh = Number(updated.night_kwh);
  assert.ok(Math.abs(nightKwh - 150) < 0.01, 'Server must calculate, not trust client');
});

test('test_srv03_5: invalid_monthly_kwh_rejected', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: `+84902004${String(Date.now()).slice(-4)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await assert.rejects(
    async () => {
      await updateProjectUsage(orgId, project.id, {
        monthly_kwh: -100,
        day_usage_pct: 70,
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('positive'));
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await updateProjectUsage(orgId, project.id, {
        monthly_kwh: 0,
        day_usage_pct: 70,
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('positive'));
      return true;
    }
  );
});

test('test_srv03_6: day_usage_pct_out_of_range_rejected', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: `+84902005${String(Date.now()).slice(-4)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await assert.rejects(
    async () => {
      await updateProjectUsage(orgId, project.id, {
        monthly_kwh: 500,
        day_usage_pct: -10,
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('between 0 and 100'));
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await updateProjectUsage(orgId, project.id, {
        monthly_kwh: 500,
        day_usage_pct: 150,
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('between 0 and 100'));
      return true;
    }
  );
});
