/**
 * SRV-02: Project CRUD (Part 1 + Part 2)
 * Part 1: create from lead, lead→CONSULTING, phoneless expiry, valid/invalid transitions
 * Part 2: skip/reverse rejected, expired auto-cancel, list by assigned, sales isolation
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProjectFromLead,
  updateProjectStatus,
  cancelExpiredProjects,
  listProjectsForSales,
  listProjectsLead,
} from '../services/projects-lead';
import { createLead } from '../services/leads';
import { createUser } from '../services/users';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase, withOrgContext } from '../config/database';
import { PROJECT_STATES } from '../../../shared/src/constants/states';

test.before(async () => {
  await connectDatabase();
});

test('test_srv02_1: create_project_from_lead', async () => {
  const orgId = await getDefaultOrganizationId();

  const lead = await createLead(orgId, {
    phone: '+84901000001',
    partner_code: 'TEST_PARTNER',
  });

  const project = await createProjectFromLead(orgId, lead.id);

  assert.ok(project.id);
  assert.equal(project.lead_id, lead.id);
  assert.equal(project.status, PROJECT_STATES.SURVEY_PENDING);
  assert.ok(project.customer_phone);
});

test('test_srv02_2: create_project_transitions_lead_to_consulting', async () => {
  const orgId = await getDefaultOrganizationId();
  const uniquePhone = `+84901000${String(Date.now()).slice(-4)}`;

  const lead = await createLead(orgId, {
    phone: uniquePhone,
  });

  let leadStatus: string;
  await withOrgContext(orgId, async (client) => {
    const r = await client.query(`SELECT status FROM leads WHERE id = $1`, [lead.id]);
    leadStatus = r.rows[0].status;
  });
  assert.equal(leadStatus!, 'RECEIVED');

  await createProjectFromLead(orgId, lead.id);

  await withOrgContext(orgId, async (client) => {
    const r = await client.query(`SELECT status FROM leads WHERE id = $1`, [lead.id]);
    leadStatus = r.rows[0].status;
  });
  assert.equal(leadStatus!, 'CONSULTING');
});

test('test_srv02_3: project_without_phone_has_expiry', async () => {
  const orgId = await getDefaultOrganizationId();

  let leadId: string;
  await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `INSERT INTO leads (organization_id, status, phone) VALUES ($1, 'RECEIVED', NULL) RETURNING id`,
      [orgId]
    );
    leadId = result.rows[0].id;
  });

  const project = await createProjectFromLead(orgId, leadId!);

  assert.ok(project.expires_at, 'Phoneless project should have expiry');

  const expiresAt = new Date(project.expires_at!);
  const now = new Date();
  const diffDays = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  assert.ok(diffDays >= 28 && diffDays <= 32, 'Expiry should be ~30 days');
});

test('test_srv02_4: valid_state_transition_works', async () => {
  const orgId = await getDefaultOrganizationId();

  const lead = await createLead(orgId, { phone: '+84901000004' });
  const project = await createProjectFromLead(orgId, lead.id);

  const updated = await updateProjectStatus(
    orgId,
    project.id,
    PROJECT_STATES.SURVEY_IN_PROGRESS
  );

  assert.equal(updated.status, PROJECT_STATES.SURVEY_IN_PROGRESS);
});

test('test_srv02_5: invalid_state_transition_rejected', async () => {
  const orgId = await getDefaultOrganizationId();

  const lead = await createLead(orgId, { phone: '+84901000005' });
  const project = await createProjectFromLead(orgId, lead.id);

  await assert.rejects(
    async () => {
      await updateProjectStatus(orgId, project.id, PROJECT_STATES.QUOTE_READY);
    },
    (error: Error) => {
      assert.ok(
        error.message.includes('Invalid transition') || error.name === 'StateMachineError'
      );
      return true;
    }
  );
});

// --- Part 2: State validation + ownership ---

test('test_srv02_6: skip_state_rejected', async () => {
  const orgId = await getDefaultOrganizationId();

  const lead = await createLead(orgId, { phone: '+84901000006' });
  const project = await createProjectFromLead(orgId, lead.id);

  await assert.rejects(
    async () => {
      await updateProjectStatus(orgId, project.id, PROJECT_STATES.SURVEY_COMPLETED);
    },
    (error: Error) => {
      assert.ok(
        error.message.includes('skip') ||
          error.message.includes('Invalid transition') ||
          error.name === 'StateMachineError'
      );
      return true;
    }
  );
});

test('test_srv02_7: reverse_state_rejected', async () => {
  const orgId = await getDefaultOrganizationId();

  const lead = await createLead(orgId, { phone: '+84901000007' });
  const project = await createProjectFromLead(orgId, lead.id);

  await updateProjectStatus(orgId, project.id, PROJECT_STATES.SURVEY_IN_PROGRESS);

  await assert.rejects(
    async () => {
      await updateProjectStatus(orgId, project.id, PROJECT_STATES.SURVEY_PENDING);
    },
    (error: Error) => {
      assert.ok(
        error.message.includes('reverse') ||
          error.message.includes('Invalid transition') ||
          error.name === 'StateMachineError'
      );
      return true;
    }
  );
});

test('test_srv02_8: expired_phoneless_project_cancelled', async () => {
  const orgId = await getDefaultOrganizationId();

  let leadId: string;
  await withOrgContext(orgId, async (client) => {
    const leadResult = await client.query(
      `INSERT INTO leads (organization_id, status, phone) VALUES ($1, 'RECEIVED', NULL) RETURNING id`,
      [orgId]
    );
    leadId = leadResult.rows[0].id;
  });

  const project = await createProjectFromLead(orgId, leadId!);

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE projects SET expires_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [project.id]
    );
  });

  const cancelledCount = await cancelExpiredProjects(orgId);
  assert.ok(cancelledCount >= 1, 'Should cancel at least 1 expired project');

  await withOrgContext(orgId, async (client) => {
    const updated = await client.query(
      `SELECT status FROM projects WHERE id = $1`,
      [project.id]
    );
    assert.equal(updated.rows[0].status, PROJECT_STATES.CANCELLED);
  });
});

test('test_srv02_9: project_list_filtered_by_assigned_to', async () => {
  const orgId = await getDefaultOrganizationId();
  const ts = Date.now();

  const user1 = await createUser(orgId, {
    email: `sales_filter1_${ts}@test.com`,
    password: 'pass',
    full_name: 'Sales Filter 1',
    role: 'SALES',
  });

  const user2 = await createUser(orgId, {
    email: `sales_filter2_${ts}@test.com`,
    password: 'pass',
    full_name: 'Sales Filter 2',
    role: 'SALES',
  });

  const lead1 = await createLead(orgId, { phone: '+84901000009' });
  await createProjectFromLead(orgId, lead1.id, user1.id);

  const lead2 = await createLead(orgId, { phone: '+84901000010' });
  await createProjectFromLead(orgId, lead2.id, user2.id);

  const user1Projects = await listProjectsLead(orgId, { assigned_to: user1.id });

  const user1Assigned = user1Projects.filter((p) => p.assigned_to === user1.id);
  assert.ok(user1Assigned.length >= 1, 'User1 should see their own projects');

  const user2InList = user1Projects.filter((p) => p.assigned_to === user2.id);
  assert.equal(user2InList.length, 0, 'Filter should exclude other users projects');
});

test('test_srv02_10: sales_cannot_see_other_sales_projects', async () => {
  const orgId = await getDefaultOrganizationId();
  const ts = Date.now();

  const sales1 = await createUser(orgId, {
    email: `sales_iso1_${ts}@test.com`,
    password: 'pass',
    full_name: 'Sales Isolation 1',
    role: 'SALES',
  });

  const sales2 = await createUser(orgId, {
    email: `sales_iso2_${ts}@test.com`,
    password: 'pass',
    full_name: 'Sales Isolation 2',
    role: 'SALES',
  });

  const lead1 = await createLead(orgId, { phone: '+84901000011' });
  const project1 = await createProjectFromLead(orgId, lead1.id, sales1.id);

  const lead2 = await createLead(orgId, { phone: '+84901000012' });
  const project2 = await createProjectFromLead(orgId, lead2.id, sales2.id);

  const sales1Projects = await listProjectsForSales(orgId, sales1.id, 'SALES');

  const ownProject = sales1Projects.find((p) => p.id === project1.id);
  assert.ok(ownProject, 'Sales should see their own project');

  const otherProject = sales1Projects.find((p) => p.id === project2.id);
  assert.equal(otherProject, undefined, 'Sales should NOT see other sales projects');
});
