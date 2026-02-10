import { withOrgContext } from '../config/database';
import { transition, StateMachineError } from '../lib/state-machine';
import {
  PROJECT_STATES,
  PROJECT_STATE_TRANSITIONS,
  LEAD_STATES,
} from '../../../shared/src/constants/states';

export interface ProjectLead {
  id: string;
  organization_id: string;
  lead_id?: string;
  assigned_to?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  status: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Create project from lead.
 * If lead has no phone → set expiry (30 days).
 * Updates lead status to CONSULTING.
 */
export async function createProjectFromLead(
  organizationId: string,
  leadId: string,
  assignedTo?: string
): Promise<ProjectLead> {
  return await withOrgContext(organizationId, async (client) => {
    const leadResult = await client.query(
      `SELECT * FROM leads WHERE id = $1 AND organization_id = $2`,
      [leadId, organizationId]
    );

    if (leadResult.rows.length === 0) {
      throw new Error('Lead not found');
    }

    const lead = leadResult.rows[0] as { phone?: string; customer_name?: string };
    const hasPhone = lead.phone != null && String(lead.phone).trim() !== '';
    const expiresAt = hasPhone
      ? null
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const projectResult = await client.query(
      `INSERT INTO projects
       (organization_id, lead_id, assigned_to, customer_name, customer_phone, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        organizationId,
        leadId,
        assignedTo || null,
        lead.customer_name || null,
        lead.phone || null,
        PROJECT_STATES.SURVEY_PENDING,
        expiresAt,
      ]
    );

    await client.query(
      `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2`,
      [LEAD_STATES.CONSULTING, leadId]
    );

    return projectResult.rows[0] as ProjectLead;
  });
}

/**
 * List projects with optional filter by assigned_to.
 */
export async function listProjectsLead(
  organizationId: string,
  filters?: { assigned_to?: string }
): Promise<ProjectLead[]> {
  return await withOrgContext(organizationId, async (client) => {
    let query = `SELECT * FROM projects WHERE organization_id = $1`;
    const params: (string | undefined)[] = [organizationId];

    if (filters?.assigned_to) {
      query += ` AND assigned_to = $2`;
      params.push(filters.assigned_to);
    }

    query += ` ORDER BY created_at DESC`;
    const result = await client.query(query, params);
    return result.rows as ProjectLead[];
  });
}

/**
 * Check and cancel expired phoneless projects.
 * Should be run periodically (cron job in production).
 */
export async function cancelExpiredProjects(
  organizationId: string
): Promise<number> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `UPDATE projects
       SET status = $1, updated_at = NOW()
       WHERE organization_id = $2
       AND expires_at IS NOT NULL
       AND expires_at < NOW()
       AND status NOT IN ($3, $4)
       RETURNING id`,
      [
        PROJECT_STATES.CANCELLED,
        organizationId,
        PROJECT_STATES.CANCELLED,
        PROJECT_STATES.QUOTE_APPROVED,
      ]
    );
    return result.rows.length;
  });
}

/**
 * List projects for a user; sales see only their assigned projects, admin sees all.
 */
export async function listProjectsForSales(
  organizationId: string,
  userId: string,
  userRole: string
): Promise<ProjectLead[]> {
  return await withOrgContext(organizationId, async (client) => {
    let query = `SELECT * FROM projects WHERE organization_id = $1`;
    const params: (string | undefined)[] = [organizationId];

    if (userRole === 'SALES') {
      query += ` AND assigned_to = $2`;
      params.push(userId);
    }

    query += ` ORDER BY created_at DESC`;
    const result = await client.query(query, params);
    return result.rows as ProjectLead[];
  });
}

const PROJECT_STATE_ORDER = [
  PROJECT_STATES.SURVEY_PENDING,
  PROJECT_STATES.SURVEY_IN_PROGRESS,
  PROJECT_STATES.SURVEY_COMPLETED,
  PROJECT_STATES.DESIGN_IN_PROGRESS,
  PROJECT_STATES.QUOTE_READY,
  PROJECT_STATES.QUOTE_SENT,
  PROJECT_STATES.QUOTE_APPROVED,
];

/**
 * Validate state transition: allowed by machine, no skip, no reverse.
 */
function validateStateTransition(currentState: string, newState: string): void {
  const stateMachine = {
    states: Object.keys(PROJECT_STATE_TRANSITIONS),
    transitions: PROJECT_STATE_TRANSITIONS,
    initial: PROJECT_STATES.SURVEY_PENDING,
  };

  transition(stateMachine, currentState as never, newState as never);

  if (newState === PROJECT_STATES.CANCELLED) {
    return;
  }

  const currentIdx = PROJECT_STATE_ORDER.indexOf(
    currentState as (typeof PROJECT_STATE_ORDER)[number]
  );
  const newIdx = PROJECT_STATE_ORDER.indexOf(
    newState as (typeof PROJECT_STATE_ORDER)[number]
  );

  if (currentIdx !== -1 && newIdx !== -1 && newIdx < currentIdx) {
    throw new StateMachineError(
      currentState,
      newState,
      `Cannot reverse from ${currentState} to ${newState}`
    );
  }

  if (currentIdx !== -1 && newIdx !== -1 && newIdx > currentIdx + 1) {
    throw new StateMachineError(
      currentState,
      newState,
      `Cannot skip states from ${currentState} to ${newState}`
    );
  }
}

/**
 * Update project status with state machine validation (no skip, no reverse).
 */
export async function updateProjectStatus(
  organizationId: string,
  projectId: string,
  newStatus: string
): Promise<ProjectLead> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM projects WHERE id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Project not found');
    }

    const project = result.rows[0] as ProjectLead;

    validateStateTransition(project.status, newStatus);

    const updated = await client.query(
      `UPDATE projects
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [newStatus, projectId, organizationId]
    );

    return updated.rows[0] as ProjectLead;
  });
}

const FUNNEL_FIELDS = [
  'contacted_at',
  'surveyed_at',
  'quoted_at',
  'contracted_at',
  'completed_at',
] as const;

type FunnelField = (typeof FUNNEL_FIELDS)[number];

/**
 * Set funnel timestamp (immutable: only sets if not already set).
 */
export async function setFunnelTimestamp(
  organizationId: string,
  projectId: string,
  field: FunnelField
): Promise<void> {
  if (!FUNNEL_FIELDS.includes(field)) {
    throw new Error(`Invalid funnel field: ${field}`);
  }
  await withOrgContext(organizationId, async (client) => {
    await client.query(
      `UPDATE projects
       SET ${field} = NOW()
       WHERE id = $1 AND organization_id = $2 AND ${field} IS NULL`,
      [projectId, organizationId]
    );
  });
}

export { StateMachineError };
