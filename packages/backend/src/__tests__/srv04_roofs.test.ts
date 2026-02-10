/**
 * SRV-04: Multi-roof survey CRUD
 * Validation: azimuth 0-360, tilt 0-90, area > 0, usable_pct 0-100
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addRoof, listRoofs, deleteRoof } from '../services/roofs';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

function uniquePhone(): string {
  return '+8490' + String(Date.now()).slice(-7);
}

test('test_srv04_1: add_roof_creates_record', async () => {
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

  assert.ok(roof.id);
  assert.equal(roof.project_id, project.id);
  assert.equal(roof.azimuth, 180);
  assert.equal(roof.tilt, 30);
});

test('test_srv04_2: validation_azimuth_range', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: uniquePhone() });
  const project = await createProjectFromLead(orgId, lead.id);

  await assert.rejects(
    async () => {
      await addRoof(orgId, project.id, {
        roof_index: 1,
        azimuth: -10,
        tilt: 30,
        area: 50,
        usable_pct: 80,
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('Azimuth') && error.message.includes('0 and 360'));
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await addRoof(orgId, project.id, {
        roof_index: 1,
        azimuth: 400,
        tilt: 30,
        area: 50,
        usable_pct: 80,
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('Azimuth') && error.message.includes('0 and 360'));
      return true;
    }
  );
});

test('test_srv04_3: validation_tilt_range', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: uniquePhone() });
  const project = await createProjectFromLead(orgId, lead.id);

  await assert.rejects(
    async () => {
      await addRoof(orgId, project.id, {
        roof_index: 1,
        azimuth: 180,
        tilt: -5,
        area: 50,
        usable_pct: 80,
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('Tilt') && error.message.includes('0 and 90'));
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await addRoof(orgId, project.id, {
        roof_index: 1,
        azimuth: 180,
        tilt: 100,
        area: 50,
        usable_pct: 80,
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('Tilt') && error.message.includes('0 and 90'));
      return true;
    }
  );
});

test('test_srv04_4: validation_area_positive', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: uniquePhone() });
  const project = await createProjectFromLead(orgId, lead.id);

  await assert.rejects(
    async () => {
      await addRoof(orgId, project.id, {
        roof_index: 1,
        azimuth: 180,
        tilt: 30,
        area: 0,
        usable_pct: 80,
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('Area') && error.message.includes('positive'));
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await addRoof(orgId, project.id, {
        roof_index: 1,
        azimuth: 180,
        tilt: 30,
        area: -10,
        usable_pct: 80,
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('Area') && error.message.includes('positive'));
      return true;
    }
  );
});

test('test_srv04_5: validation_usable_pct_range', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: uniquePhone() });
  const project = await createProjectFromLead(orgId, lead.id);

  await assert.rejects(
    async () => {
      await addRoof(orgId, project.id, {
        roof_index: 1,
        azimuth: 180,
        tilt: 30,
        area: 50,
        usable_pct: 0,
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('Usable') && error.message.includes('0 and 100'));
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await addRoof(orgId, project.id, {
        roof_index: 1,
        azimuth: 180,
        tilt: 30,
        area: 50,
        usable_pct: 150,
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('Usable') && error.message.includes('0 and 100'));
      return true;
    }
  );
});

test('test_srv04_6: delete_roof_works', async () => {
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

  await deleteRoof(orgId, roof.id);

  const roofs = await listRoofs(orgId, project.id);
  const found = roofs.find((r) => r.id === roof.id);
  assert.equal(found, undefined, 'Roof should be deleted');
});

test('test_srv04_7: roof_belongs_to_project', async () => {
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

  assert.equal(roof.project_id, project.id, 'Roof must belong to project');
  assert.equal(roof.organization_id, orgId, 'Roof must belong to org');
});

test('test_srv04_8: multiple_roofs_different_index', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, { phone: uniquePhone() });
  const project = await createProjectFromLead(orgId, lead.id);

  await addRoof(orgId, project.id, {
    roof_index: 1,
    azimuth: 180,
    tilt: 30,
    area: 50,
    usable_pct: 80,
  });

  await addRoof(orgId, project.id, {
    roof_index: 2,
    azimuth: 90,
    tilt: 20,
    area: 40,
    usable_pct: 75,
  });

  await addRoof(orgId, project.id, {
    roof_index: 3,
    azimuth: 270,
    tilt: 25,
    area: 60,
    usable_pct: 85,
  });

  const roofs = await listRoofs(orgId, project.id);
  assert.ok(roofs.length >= 3, 'Should have at least 3 roofs');

  const indices = roofs.map((r) => r.roof_index).sort((a, b) => a - b);
  assert.ok(
    indices.includes(1) && indices.includes(2) && indices.includes(3),
    'Should have roofs 1, 2, 3'
  );
});
