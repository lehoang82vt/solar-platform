/**
 * SRV-05: PVGIS integration (mock mode)
 * Saves monthly data to roof, calculates avg and min month, requires project location.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPVGIS } from '../services/pvgis';
import { addRoof } from '../services/roofs';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase, getDatabasePool, withOrgContext } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

function uniquePhone(): string {
  return '+8490' + String(Date.now()).slice(-7);
}

test('test_srv05_1: pvgis_saves_result_to_roof', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: uniquePhone() });
  const project = await createProjectFromLead(orgId, lead.id);

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE projects SET customer_address = $1 WHERE id = $2`,
      ['123 Test Street, HCMC', project.id]
    );
  });

  const roof = await addRoof(orgId, project.id, {
    roof_index: 1,
    azimuth: 180,
    tilt: 30,
    area: 50,
    usable_pct: 80,
  });

  await fetchPVGIS(orgId, project.id, roof.id);

  const pool = getDatabasePool();
  assert.ok(pool);
  const result = await pool.query(
    `SELECT pvgis_monthly, pvgis_avg, pvgis_min_month, pvgis_fetched_at FROM project_roofs WHERE id = $1`,
    [roof.id]
  );

  const savedRoof = result.rows[0];
  assert.ok(savedRoof.pvgis_monthly, 'Should save monthly data');
  assert.ok(savedRoof.pvgis_avg != null, 'Should save average');
  assert.ok(savedRoof.pvgis_min_month != null, 'Should save min month');
  assert.ok(savedRoof.pvgis_fetched_at, 'Should save fetch timestamp');
});

test('test_srv05_2: pvgis_calculates_avg_correctly', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: uniquePhone() });
  const project = await createProjectFromLead(orgId, lead.id);

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE projects SET customer_address = $1 WHERE id = $2`,
      ['123 Test Street, HCMC', project.id]
    );
  });

  const roof = await addRoof(orgId, project.id, {
    roof_index: 1,
    azimuth: 180,
    tilt: 30,
    area: 50,
    usable_pct: 80,
  });

  const result = await fetchPVGIS(orgId, project.id, roof.id);

  const sum = result.monthly.reduce((acc, m) => acc + m.kwh_per_m2_day, 0);
  const expectedAvg = sum / 12;

  assert.ok(
    Math.abs(result.avg - expectedAvg) < 0.01,
    'Average should be calculated correctly'
  );
});

test('test_srv05_3: pvgis_finds_min_month_correctly', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: uniquePhone() });
  const project = await createProjectFromLead(orgId, lead.id);

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE projects SET customer_address = $1 WHERE id = $2`,
      ['123 Test Street, HCMC', project.id]
    );
  });

  const roof = await addRoof(orgId, project.id, {
    roof_index: 1,
    azimuth: 180,
    tilt: 30,
    area: 50,
    usable_pct: 80,
  });

  const result = await fetchPVGIS(orgId, project.id, roof.id);

  let minValue = result.monthly[0].kwh_per_m2_day;
  let minMonth = 1;

  for (const m of result.monthly) {
    if (m.kwh_per_m2_day < minValue) {
      minValue = m.kwh_per_m2_day;
      minMonth = m.month;
    }
  }

  assert.equal(result.min_month, minMonth, 'Should find minimum month correctly');
});

test('test_srv05_4: pvgis_requires_project_location', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: uniquePhone() });
  const project = await createProjectFromLead(orgId, lead.id);

  const roof = await addRoof(orgId, project.id, {
    roof_index: 1,
    azimuth: 180,
    tilt: 30,
    area: 50,
    usable_pct: 80,
  });

  await assert.rejects(
    async () => {
      await fetchPVGIS(orgId, project.id, roof.id);
    },
    (error: Error) => {
      assert.ok(
        error.message.includes('location') || error.message.includes('address')
      );
      return true;
    }
  );
});

test('test_srv05_5: pvgis_mock_returns_valid_data', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: uniquePhone() });
  const project = await createProjectFromLead(orgId, lead.id);

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE projects SET customer_address = $1 WHERE id = $2`,
      ['123 Test Street, HCMC', project.id]
    );
  });

  const roof = await addRoof(orgId, project.id, {
    roof_index: 1,
    azimuth: 180,
    tilt: 30,
    area: 50,
    usable_pct: 80,
  });

  const result = await fetchPVGIS(orgId, project.id, roof.id);

  assert.equal(result.monthly.length, 12, 'Should have 12 months');
  assert.ok(result.avg > 0, 'Average should be positive');
  assert.ok(
    result.min_month >= 1 && result.min_month <= 12,
    'Min month should be 1-12'
  );

  for (const m of result.monthly) {
    assert.ok(m.month >= 1 && m.month <= 12, 'Month should be 1-12');
    assert.ok(m.kwh_per_m2_day > 0, 'Irradiation should be positive');
  }
});
