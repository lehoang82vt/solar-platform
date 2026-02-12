import { withOrgContext } from '../config/database';
import { getProjectByIdOrgSafe } from './projects';
import { listContractsByProject } from './contracts';
import { CONTRACT_STATUS } from './contracts';

/** Handover type (schema 038 doesn't have status, only handover_type). */
export const HANDOVER_TYPE = {
  INSTALLATION: 'INSTALLATION',
  COMMISSIONING: 'COMMISSIONING',
  FINAL: 'FINAL',
} as const;

const ACCEPTANCE_REQUIRED_KEYS = ['site_address', 'handover_date', 'representative_a', 'representative_b', 'checklist'] as const;

function validateAcceptanceJson(acceptance_json: unknown): { ok: true } | { ok: false; missing_fields: string[] } {
  if (acceptance_json == null || typeof acceptance_json !== 'object' || Array.isArray(acceptance_json)) {
    return { ok: false, missing_fields: [...ACCEPTANCE_REQUIRED_KEYS] };
  }
  const o = acceptance_json as Record<string, unknown>;
  const missing: string[] = [];
  for (const key of ACCEPTANCE_REQUIRED_KEYS) {
    if (o[key] === undefined || o[key] === null) {
      missing.push(key);
    }
  }
  if (missing.length > 0) return { ok: false, missing_fields: missing };
  if (typeof o.site_address !== 'string') missing.push('site_address');
  if (typeof o.handover_date !== 'string') missing.push('handover_date');
  if (typeof o.representative_a !== 'string') missing.push('representative_a');
  if (typeof o.representative_b !== 'string') missing.push('representative_b');
  if (!Array.isArray(o.checklist)) {
    missing.push('checklist');
  } else {
    for (let i = 0; i < o.checklist.length; i++) {
      const item = o.checklist[i];
      if (item == null || typeof item !== 'object' || typeof (item as Record<string, unknown>).name !== 'string' || typeof (item as Record<string, unknown>).status !== 'boolean') {
        missing.push(`checklist[${i}]`);
        break;
      }
    }
  }
  if (missing.length > 0) return { ok: false, missing_fields: missing };
  return { ok: true };
}

export interface HandoverRow {
  id: string;
  organization_id: string;
  project_id?: string; // Schema 038: not directly in handovers, get via contract
  contract_id: string;
  status?: string; // Schema 038: use handover_type instead
  handover_type?: string; // Schema 038
  acceptance_json?: Record<string, unknown>; // Schema 038: use checklist instead
  checklist?: Record<string, unknown>; // Schema 038
  signed_at?: string | null;
  signed_by?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  created_at: string;
  updated_at?: string; // Schema 038: doesn't have updated_at
}

export type CreateHandoverResult =
  | { kind: 'project_not_found' }
  | { kind: 'no_contract' }
  | { kind: 'validation_failed'; missing_fields: string[] }
  | { kind: 'ok'; handover: HandoverRow };

/**
 * Create handover. Precondition: project exists and has at least one contract in HANDOVER or COMPLETED.
 */
export async function createHandover(
  organizationId: string,
  projectId: string,
  input: { contract_id?: string; acceptance_json?: unknown }
): Promise<CreateHandoverResult> {
  const project = await getProjectByIdOrgSafe(projectId, organizationId);
  if (!project) return { kind: 'project_not_found' };

  const contracts = await listContractsByProject(organizationId, projectId);
  const ready = contracts.filter((c) => {
    const s = (c.status || '').toUpperCase();
    return s === CONTRACT_STATUS.HANDOVER || s === CONTRACT_STATUS.COMPLETED;
  });
  if (ready.length === 0) return { kind: 'no_contract' };

  const acceptance = input.acceptance_json ?? {};
  const validation = validateAcceptanceJson(acceptance);
  if (!validation.ok) {
    return { kind: 'validation_failed', missing_fields: validation.missing_fields };
  }

  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `INSERT INTO handovers (organization_id, project_id, contract_id, status, acceptance_json)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, organization_id, project_id, contract_id, status, acceptance_json,
         signed_at, signed_by, completed_at, completed_by, created_at, updated_at`,
      [
        organizationId,
        projectId,
        input.contract_id ?? null,
        HANDOVER_STATUS.DRAFT,
        JSON.stringify(acceptance),
      ]
    );
    const row = result.rows[0] as Record<string, unknown>;
    return { kind: 'ok', handover: mapRowToHandover(row) };
  });
}

function mapRowToHandover(row: Record<string, unknown>): HandoverRow {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    project_id: row.project_id as string,
    contract_id: row.contract_id as string | null,
    status: row.status as string,
    acceptance_json: (row.acceptance_json as Record<string, unknown>) || {},
    signed_at: row.signed_at as string | null,
    signed_by: row.signed_by as string | null,
    completed_at: row.completed_at as string | null,
    completed_by: row.completed_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

async function getHandoverByIdProjectOrg(
  client: { query: (q: string, p: unknown[]) => Promise<{ rows: unknown[] }> },
  handoverId: string,
  projectId: string
): Promise<HandoverRow | null> {
  const result = await client.query(
    `SELECT id, organization_id, project_id, contract_id, status, acceptance_json,
      signed_at, signed_by, completed_at, completed_by, created_at, updated_at
     FROM handovers WHERE id = $1 AND project_id = $2`,
    [handoverId, projectId]
  );
  if (result.rows.length === 0) return null;
  return mapRowToHandover(result.rows[0] as Record<string, unknown>);
}

export async function getHandoverByIdOrg(
  organizationId: string,
  projectId: string,
  handoverId: string
): Promise<HandoverRow | null> {
  return await withOrgContext(organizationId, async (client) => {
    return getHandoverByIdProjectOrg(client, handoverId, projectId);
  });
}

export async function listHandoversByProject(
  organizationId: string,
  projectId: string
): Promise<HandoverRow[]> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT id, organization_id, project_id, contract_id, status, acceptance_json,
        signed_at, signed_by, completed_at, completed_by, created_at, updated_at
       FROM handovers WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId]
    );
    return result.rows.map((r) => mapRowToHandover(r as Record<string, unknown>));
  });
}

/** F-32: List handovers v2 item (join project, optional customer via contract->quote, optional contract). */
export interface HandoverListV2Item {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  project: {
    id: string;
    customer_name: string;
    address: string | null;
    status: string;
  };
  /** Populated when handover has contract_id and that contract has quote_id -> customer snapshot; else null (projects table has no customer_id). */
  customer: {
    id: string | null;
    name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  contract: {
    id: string;
    contract_number: string;
    status: string;
  } | null;
}

export interface ListHandoversV2Result {
  value: HandoverListV2Item[];
  paging: { limit: number; offset: number; count: number };
}

/**
 * List handovers v2: join project (customer_name, address, status), optional customer (via contract->quote->customer), optional contract.
 * Filters: status (exact case-insensitive), project_id, contract_id, search (ILIKE projects.customer_name OR contracts.contract_number).
 * Order handovers.created_at DESC. Paging count = total matching rows (consistent with F-30).
 */
export async function listHandoversV2(
  organizationId: string,
  limit: number,
  offset: number,
  filters?: { status?: string; project_id?: string; contract_id?: string; search?: string }
): Promise<ListHandoversV2Result> {
  return await withOrgContext(organizationId, async (client) => {
    const conditions: string[] = [];
    const params: (number | string)[] = [limit, offset];
    let paramIndex = 3;

    if (filters?.status != null && filters.status.trim() !== '') {
      // Schema 038: handovers doesn't have status, use handover_type instead
      conditions.push(`LOWER(TRIM(handovers.handover_type)) = LOWER(TRIM($${paramIndex}))`);
      params.push(filters.status.trim());
      paramIndex += 1;
    }
    if (filters?.project_id != null && filters.project_id.trim() !== '') {
      conditions.push(`contracts.project_id = $${paramIndex}`);
      params.push(filters.project_id.trim());
      paramIndex += 1;
    }
    if (filters?.contract_id != null && filters.contract_id.trim() !== '') {
      conditions.push(`handovers.contract_id = $${paramIndex}`);
      params.push(filters.contract_id.trim());
      paramIndex += 1;
    }
    if (filters?.search != null && filters.search.trim() !== '') {
      const likePattern = '%' + filters.search.trim() + '%';
      conditions.push(
        `(projects.customer_name ILIKE $${paramIndex} OR contracts.contract_number ILIKE $${paramIndex} OR quotes.customer_name ILIKE $${paramIndex} OR quotes.customer_phone ILIKE $${paramIndex})`
      );
      params.push(likePattern);
      paramIndex += 1;
    }

    // Add organization filter
    const orgCondition = `handovers.organization_id = (current_setting('app.current_org_id', true))::uuid`;
    const allConditions = [orgCondition, ...conditions];
    const whereClause = allConditions.length > 0 ? ' WHERE ' + allConditions.join(' AND ') : '';

    const result = await client.query(
      `SELECT
         handovers.id,
         handovers.handover_type,
         handovers.handover_date,
         handovers.created_at,
         handovers.created_at as updated_at,
         projects.id as project_id,
         projects.customer_name as project_customer_name,
         projects.address as project_address,
         projects.status as project_status,
         quotes.customer_name as customer_name,
         quotes.customer_phone as customer_phone,
         quotes.customer_email as customer_email,
         contracts.id as contract_id,
         contracts.contract_number as contract_contract_number,
         contracts.status as contract_status
       FROM handovers
       LEFT JOIN contracts ON handovers.contract_id = contracts.id
       LEFT JOIN projects ON contracts.project_id = projects.id
       LEFT JOIN quotes ON contracts.quote_id = quotes.id
       ${whereClause}
       ORDER BY handovers.created_at DESC
       LIMIT $1
       OFFSET $2`,
      params
    );

    const countParams: (string | number)[] = [];
    const countConditions: string[] = [];
    let countParamIndex = 1;
    if (filters?.status != null && filters.status.trim() !== '') {
      countConditions.push(`LOWER(TRIM(handovers.handover_type)) = LOWER(TRIM($${countParamIndex}))`);
      countParams.push(filters.status.trim());
      countParamIndex += 1;
    }
    if (filters?.project_id != null && filters.project_id.trim() !== '') {
      countConditions.push(`contracts.project_id = $${countParamIndex}`);
      countParams.push(filters.project_id.trim());
      countParamIndex += 1;
    }
    if (filters?.contract_id != null && filters.contract_id.trim() !== '') {
      countConditions.push(`handovers.contract_id = $${countParamIndex}`);
      countParams.push(filters.contract_id.trim());
      countParamIndex += 1;
    }
    if (filters?.search != null && filters.search.trim() !== '') {
      const likePattern = '%' + filters.search.trim() + '%';
      countConditions.push(
        `(projects.customer_name ILIKE $${countParamIndex} OR contracts.contract_number ILIKE $${countParamIndex} OR quotes.customer_name ILIKE $${countParamIndex} OR quotes.customer_phone ILIKE $${countParamIndex})`
      );
      countParams.push(likePattern);
    }
    const countOrgCondition = `handovers.organization_id = (current_setting('app.current_org_id', true))::uuid`;
    const countAllConditions = [countOrgCondition, ...countConditions];
    const countFrom = `FROM handovers
       LEFT JOIN contracts ON handovers.contract_id = contracts.id
       LEFT JOIN projects ON contracts.project_id = projects.id
       LEFT JOIN quotes ON contracts.quote_id = quotes.id`;
    const countWhereClause =
      countAllConditions.length > 0 ? ' WHERE ' + countAllConditions.join(' AND ') : '';
    const countResult = await client.query(
      `SELECT COUNT(*)::int ${countFrom}${countWhereClause}`,
      countParams.length > 0 ? countParams : undefined
    );
    const totalCount = parseInt(String(countResult.rows[0].count), 10);

    const value = (result.rows as Array<{
      id: string;
      status: string;
      created_at: string;
      updated_at: string;
      project_id: string;
      project_customer_name: string;
      project_address: string | null;
      project_status: string;
      customer_name: string | null;
      customer_phone: string | null;
      customer_email: string | null;
      contract_id: string | null;
      contract_contract_number: string | null;
      contract_status: string | null;
    }>).map((row) => ({
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      project: {
        id: row.project_id,
        customer_name: row.project_customer_name,
        address: row.project_address,
        status: row.project_status ?? 'NEW',
      },
      customer:
        row.customer_name != null
          ? {
              id: null, // Quotes v2 schema doesn't have customer_id, only snapshot
              name: row.customer_name,
              phone: row.customer_phone,
              email: row.customer_email,
            }
          : null,
      contract:
        row.contract_id != null && row.contract_contract_number != null
          ? {
              id: row.contract_id,
              contract_number: row.contract_contract_number,
              status: row.contract_status ?? '',
            }
          : null,
    }));

    return {
      value,
      paging: { limit, offset, count: totalCount },
    };
  });
}

export type UpdateHandoverResult =
  | { kind: 'not_found' }
  | { kind: 'immutable' }
  | { kind: 'validation_failed'; missing_fields: string[] }
  | { kind: 'ok'; handover: HandoverRow };

export async function updateHandover(
  organizationId: string,
  projectId: string,
  handoverId: string,
  patch: { acceptance_json?: unknown }
): Promise<UpdateHandoverResult> {
  return await withOrgContext(organizationId, async (client) => {
    const exist = await client.query(
      'SELECT id, status FROM handovers WHERE id = $1 AND project_id = $2',
      [handoverId, projectId]
    );
    if (exist.rows.length === 0) return { kind: 'not_found' };
    const status = (exist.rows[0] as { status: string }).status;
    const upper = (status || '').toUpperCase();
    if (upper !== HANDOVER_STATUS.DRAFT) {
      return { kind: 'immutable' };
    }
    if (patch.acceptance_json !== undefined) {
      const validation = validateAcceptanceJson(patch.acceptance_json);
      if (!validation.ok) {
        return { kind: 'validation_failed', missing_fields: validation.missing_fields };
      }
      await client.query(
        `UPDATE handovers SET acceptance_json = $1, updated_at = now() WHERE id = $2 AND project_id = $3`,
        [JSON.stringify(patch.acceptance_json), handoverId, projectId]
      );
    }
    const handover = await getHandoverByIdProjectOrg(client, handoverId, projectId);
    return handover ? { kind: 'ok', handover } : { kind: 'not_found' };
  });
}

export type SignHandoverResult =
  | { kind: 'not_found' }
  | { kind: 'invalid_state'; status: string }
  | { kind: 'ok'; handover: HandoverRow };

export async function signHandover(
  organizationId: string,
  projectId: string,
  handoverId: string,
  signedBy: string
): Promise<SignHandoverResult> {
  return await withOrgContext(organizationId, async (client) => {
    const exist = await client.query(
      'SELECT id, status FROM handovers WHERE id = $1 AND project_id = $2',
      [handoverId, projectId]
    );
    if (exist.rows.length === 0) return { kind: 'not_found' };
    const status = (exist.rows[0] as { status: string }).status;
    if ((status || '').toUpperCase() !== HANDOVER_STATUS.DRAFT) {
      return { kind: 'invalid_state', status };
    }
    await client.query(
      `UPDATE handovers SET status = $1, signed_at = now(), signed_by = $2, updated_at = now()
       WHERE id = $3 AND project_id = $4`,
      [HANDOVER_STATUS.SIGNED, signedBy, handoverId, projectId]
    );
    const handover = await getHandoverByIdProjectOrg(client, handoverId, projectId);
    return handover ? { kind: 'ok', handover } : { kind: 'not_found' };
  });
}

export type CompleteHandoverResult =
  | { kind: 'not_found' }
  | { kind: 'invalid_state'; status: string }
  | { kind: 'ok'; handover: HandoverRow };

export async function completeHandover(
  organizationId: string,
  projectId: string,
  handoverId: string,
  completedBy: string
): Promise<CompleteHandoverResult> {
  return await withOrgContext(organizationId, async (client) => {
    const exist = await client.query(
      'SELECT id, status FROM handovers WHERE id = $1 AND project_id = $2',
      [handoverId, projectId]
    );
    if (exist.rows.length === 0) return { kind: 'not_found' };
    const status = (exist.rows[0] as { status: string }).status;
    if ((status || '').toUpperCase() !== HANDOVER_STATUS.SIGNED) {
      return { kind: 'invalid_state', status };
    }
    await client.query(
      `UPDATE handovers SET status = $1, completed_at = now(), completed_by = $2, updated_at = now()
       WHERE id = $3 AND project_id = $4`,
      [HANDOVER_STATUS.COMPLETED, completedBy, handoverId, projectId]
    );
    const handover = await getHandoverByIdProjectOrg(client, handoverId, projectId);
    return handover ? { kind: 'ok', handover } : { kind: 'not_found' };
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidHandoverId(id: string): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}
