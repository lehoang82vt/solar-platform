import { withOrgContext } from '../config/database';
import { getQuoteWithCustomer } from './quotes';
import { getProjectByIdOrgSafe, PROJECT_STATUS, transitionProjectStatus } from './projects';
import { write as auditLogWrite } from './auditLog';

/** Gate APPROVED: convention repo ACCEPTED/APPROVED/CUSTOMER_ACCEPTED (case-insensitive). */
export function isQuoteApproved(status: string): boolean {
  const s = (status || '').trim().toLowerCase();
  return s === 'accepted' || s === 'approved' || s === 'customer_accepted';
}

/**
 * Contract status stored UPPERCASE in DB. Phase 3 blueprint: DRAFT → SIGNED → INSTALLING → HANDOVER → COMPLETED (+ CANCELLED).
 */
export const CONTRACT_STATUS = {
  DRAFT: 'DRAFT',
  SIGNED: 'SIGNED',
  INSTALLING: 'INSTALLING',
  HANDOVER: 'HANDOVER',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type ContractStatus = (typeof CONTRACT_STATUS)[keyof typeof CONTRACT_STATUS];

/** Valid forward chain after SIGNED. */
const VALID_NEXT_STATUS: Record<string, string[]> = {
  SIGNED: ['INSTALLING'],
  INSTALLING: ['HANDOVER'],
  HANDOVER: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const CONTRACT_TRANSITION_TARGETS = ['INSTALLING', 'HANDOVER', 'COMPLETED', 'CANCELLED'] as const;
const CANCELLABLE_STATUSES = [
  CONTRACT_STATUS.DRAFT,
  CONTRACT_STATUS.SIGNED,
  CONTRACT_STATUS.INSTALLING,
  CONTRACT_STATUS.HANDOVER,
] as const;
const CANCELLABLE_FROM: Set<string> = new Set(CANCELLABLE_STATUSES);

const CONTRACT_PROJECT_STATUS_MAP: Partial<Record<ContractStatus, string>> = {
  [CONTRACT_STATUS.SIGNED]: PROJECT_STATUS.CONTRACTED,
  [CONTRACT_STATUS.INSTALLING]: PROJECT_STATUS.INSTALLED,
  [CONTRACT_STATUS.COMPLETED]: PROJECT_STATUS.COMPLETED,
};

export interface PaymentTermInput {
  milestone: string;
  pct: number;
}

export interface CreateContractInput {
  quote_id: string;
  payment_terms: PaymentTermInput[];
  warranty_terms?: string;
  construction_days?: number;
}

export interface ContractRow {
  id: string;
  organization_id: string;
  project_id: string;
  quote_id: string;
  contract_number: string;
  status: string;
  contract_value: string;
  customer_snapshot: Record<string, unknown>;
  system_snapshot: Record<string, unknown>;
  financial_snapshot: Record<string, unknown>;
  payment_terms: PaymentTermInput[];
  warranty_terms: string | null;
  construction_days: number | null;
  signed_at: string | null;
  signed_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateContractResult =
  | { kind: 'quote_not_found' }
  | { kind: 'quote_not_approved'; status: string }
  | { kind: 'quote_project_mismatch' }
  | { kind: 'quote_price_total_required' }
  | { kind: 'payment_terms_invalid'; error: string }
  | { kind: 'project_not_found' }
  | { kind: 'ok'; contract: ContractRow; quote_status: string };

/**
 * Generate next contract_number for org: HD-{YYYY}-{seq 3 digits}, reset each year.
 */
export async function getNextContractNumber(
  organizationId: string,
  client: { query: (q: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }
): Promise<string> {
  const year = new Date().getFullYear();
  await client.query(
    `INSERT INTO contract_number_sequences (organization_id, year, last_seq)
     VALUES ($1, $2, 0)
     ON CONFLICT (organization_id, year) DO NOTHING`,
    [organizationId, year]
  );
  const result = await client.query(
    `UPDATE contract_number_sequences
     SET last_seq = last_seq + 1
     WHERE organization_id = $1 AND year = $2
     RETURNING last_seq`,
    [organizationId, year]
  );
  const seq = (result.rows[0] as { last_seq: number }).last_seq;
  const padded = String(seq).padStart(3, '0');
  return `HD-${year}-${padded}`;
}

/**
 * Create contract from APPROVED quote. Snapshot customer/system/financial from quote.
 * contract_value = quotes.price_total (column). If null => QUOTE_PRICE_TOTAL_REQUIRED.
 * Validates payment_terms sum = 100.
 */
export async function createContract(
  organizationId: string,
  projectId: string,
  input: CreateContractInput
): Promise<CreateContractResult> {
  const project = await getProjectByIdOrgSafe(projectId, organizationId);
  if (!project) {
    return { kind: 'project_not_found' };
  }

  const quote = await getQuoteWithCustomer(input.quote_id, organizationId);
  if (!quote) {
    return { kind: 'quote_not_found' };
  }
  if (!isQuoteApproved(quote.status)) {
    return { kind: 'quote_not_approved', status: quote.status };
  }

  const payload = (quote.payload || {}) as Record<string, unknown>;
  const quoteProjectId = payload.project_id != null ? String(payload.project_id) : null;
  if (quoteProjectId !== projectId) {
    return { kind: 'quote_project_mismatch' };
  }

  const sumPct = input.payment_terms.reduce((s, t) => s + (t.pct || 0), 0);
  if (Math.abs(sumPct - 100) > 0.01) {
    return { kind: 'payment_terms_invalid', error: 'payment_terms total must equal 100' };
  }

  const priceTotal = quote.price_total != null ? Number(quote.price_total) : null;
  if (priceTotal === null || !Number.isFinite(priceTotal) || priceTotal < 0) {
    return { kind: 'quote_price_total_required' };
  }

  const customer_snapshot: Record<string, unknown> = {
    name: quote.customer_name,
    phone: quote.customer_phone,
    email: quote.customer_email,
    address: undefined,
  };
  const system_snapshot =
    (payload.system_snapshot as Record<string, unknown>) ??
    (payload.system as Record<string, unknown>) ??
    {};
  const financial_snapshot =
    (payload.financial_snapshot as Record<string, unknown>) ??
    (payload.financial as Record<string, unknown>) ??
    { price_total: priceTotal };

  return await withOrgContext(organizationId, async (client) => {
    const contract_number = await getNextContractNumber(organizationId, client);
    const result = await client.query(
      `INSERT INTO contracts (
        organization_id, project_id, quote_id, contract_number, status,
        total_vnd, customer_snapshot, system_snapshot, financial_snapshot,
        payment_terms, warranty_terms, construction_days
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, organization_id, project_id, quote_id, contract_number, status,
        total_vnd::text as contract_value, customer_snapshot, system_snapshot, financial_snapshot,
        payment_terms, warranty_terms, construction_days,
        signed_at, signed_by, cancel_reason, created_at, updated_at`,
      [
        organizationId,
        projectId,
        input.quote_id,
        contract_number,
        CONTRACT_STATUS.DRAFT,
        priceTotal,
        JSON.stringify(customer_snapshot),
        JSON.stringify(system_snapshot),
        JSON.stringify(financial_snapshot),
        JSON.stringify(input.payment_terms),
        input.warranty_terms ?? null,
        input.construction_days ?? null,
      ]
    );
    const row = result.rows[0] as {
      id: string;
      organization_id: string;
      project_id: string;
      quote_id: string;
      contract_number: string;
      status: string;
      contract_value: string;
      customer_snapshot: unknown;
      system_snapshot: unknown;
      financial_snapshot: unknown;
      payment_terms: unknown;
      warranty_terms: string | null;
      construction_days: number | null;
      signed_at: string | null;
      signed_by: string | null;
      cancel_reason: string | null;
      created_at: string;
      updated_at: string;
    };
    return {
      kind: 'ok',
      contract: {
        ...row,
        customer_snapshot: (row.customer_snapshot as Record<string, unknown>) || {},
        system_snapshot: (row.system_snapshot as Record<string, unknown>) || {},
        financial_snapshot: (row.financial_snapshot as Record<string, unknown>) || {},
        payment_terms: (row.payment_terms as PaymentTermInput[]) || [],
      },
      quote_status: quote.status,
    };
  });
}

/** Sign contract: only DRAFT -> SIGNED. Set signed_at, signed_by. */
export type SignContractResult =
  | { kind: 'not_found' }
  | { kind: 'invalid_state'; status: string }
  | { kind: 'ok'; contract: ContractRow; fromStatus: string };

export async function signContract(
  organizationId: string,
  projectId: string,
  contractId: string,
  signedBy: string
): Promise<SignContractResult> {
  return await withOrgContext(organizationId, async (client) => {
    const exist = await client.query(
      'SELECT id, status FROM contracts WHERE id = $1 AND project_id = $2',
      [contractId, projectId]
    );
    if (exist.rows.length === 0) {
      return { kind: 'not_found' };
    }
    const status = (exist.rows[0] as { status: string }).status;
    const statusUpper = (status || '').toUpperCase();
    if (statusUpper !== CONTRACT_STATUS.DRAFT) {
      return { kind: 'invalid_state', status };
    }
    await client.query(
      `UPDATE contracts SET status = $1, signed_at = now(), signed_by = $2, updated_at = now()
       WHERE id = $3 AND project_id = $4`,
      [CONTRACT_STATUS.SIGNED, signedBy, contractId, projectId]
    );
    const contract = await getContractByIdProjectOrg(client, contractId, projectId);
    if (contract) {
      await syncProjectStatusFromContract(organizationId, contract);
      await emitContractSignedEvent(organizationId, contract, signedBy);
      return { kind: 'ok', contract, fromStatus: statusUpper };
    }
    return { kind: 'not_found' };
  });
}

async function getContractByIdProjectOrg(
  client: { query: (q: string, p: unknown[]) => Promise<{ rows: unknown[] }> },
  contractId: string,
  projectId: string
): Promise<ContractRow | null> {
  const result = await client.query(
    `SELECT id, organization_id, project_id, quote_id, contract_number, status,
      total_vnd::text as contract_value, customer_snapshot, system_snapshot, financial_snapshot,
      payment_terms, warranty_terms, construction_days,
      signed_at, signed_by, cancel_reason, created_at, updated_at
     FROM contracts WHERE id = $1 AND project_id = $2`,
    [contractId, projectId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return mapRowToContract(row);
}

/**
 * Contract transitions follow Phase 3 blueprint: SIGNED → INSTALLING → HANDOVER → COMPLETED.
 * CANCELLED can branch from DRAFT, SIGNED, INSTALLING, or HANDOVER with a reason.
 */
export type TransitionContractResult =
  | { kind: 'not_found' }
  | { kind: 'invalid_to_status' }
  | { kind: 'invalid_state'; current: string; to_status: string }
  | { kind: 'reason_required' }
  | { kind: 'ok'; contract: ContractRow; fromStatus: string };

export type ContractTransitionTarget = (typeof CONTRACT_TRANSITION_TARGETS)[number];

export async function transitionContract(
  organizationId: string,
  projectId: string,
  contractId: string,
  toStatus: string,
  reason?: string
): Promise<TransitionContractResult> {
  const toUpper = (toStatus || '').toUpperCase();
  if (!CONTRACT_TRANSITION_TARGETS.includes(toUpper as ContractTransitionTarget)) {
    return { kind: 'invalid_to_status' };
  }

  return await withOrgContext(organizationId, async (client) => {
    const exist = await client.query(
      'SELECT id, status FROM contracts WHERE id = $1 AND project_id = $2',
      [contractId, projectId]
    );
    if (exist.rows.length === 0) {
      return { kind: 'not_found' };
    }
    const current = (exist.rows[0] as { status: string }).status;
    const currentUpper = (current || '').toUpperCase();

    if (toUpper === CONTRACT_STATUS.CANCELLED) {
      const sanitized = reason?.toString().trim();
      if (!sanitized) {
        return { kind: 'reason_required' };
      }
      if (!CANCELLABLE_FROM.has(currentUpper as ContractStatus)) {
        return { kind: 'invalid_state', current: currentUpper, to_status: toUpper };
      }
      await client.query(
        `UPDATE contracts SET status = $1, cancel_reason = $2, updated_at = now() WHERE id = $3 AND project_id = $4`,
        [CONTRACT_STATUS.CANCELLED, sanitized, contractId, projectId]
      );
      const contract = await getContractByIdProjectOrg(client, contractId, projectId);
      return contract ? { kind: 'ok', contract, fromStatus: currentUpper } : { kind: 'not_found' };
    }

    const allowed = VALID_NEXT_STATUS[currentUpper];
    if (!allowed || !allowed.includes(toUpper)) {
      return { kind: 'invalid_state', current: currentUpper, to_status: toUpper };
    }
    await client.query(
      `UPDATE contracts SET status = $1, updated_at = now() WHERE id = $2 AND project_id = $3`,
      [toUpper, contractId, projectId]
    );
    const contract = await getContractByIdProjectOrg(client, contractId, projectId);
    if (contract) {
      await syncProjectStatusFromContract(organizationId, contract);
      return { kind: 'ok', contract, fromStatus: currentUpper };
    }
    return { kind: 'not_found' };
  });
}

function mapRowToContract(row: Record<string, unknown>): ContractRow {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    project_id: row.project_id as string,
    quote_id: row.quote_id as string,
    contract_number: row.contract_number as string,
    status: row.status as string,
    contract_value: row.contract_value as string,
    customer_snapshot: (row.customer_snapshot as Record<string, unknown>) || {},
    system_snapshot: (row.system_snapshot as Record<string, unknown>) || {},
    financial_snapshot: (row.financial_snapshot as Record<string, unknown>) || {},
    payment_terms: (row.payment_terms as PaymentTermInput[]) || [],
    warranty_terms: row.warranty_terms as string | null,
    construction_days: row.construction_days as number | null,
    signed_at: row.signed_at as string | null,
    signed_by: row.signed_by as string | null,
    cancel_reason: row.cancel_reason as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

async function syncProjectStatusFromContract(
  organizationId: string,
  contract: ContractRow
): Promise<void> {
  const targetStatus = CONTRACT_PROJECT_STATUS_MAP[contract.status as ContractStatus];
  if (!targetStatus) {
    return;
  }

  const result = await transitionProjectStatus(
    organizationId,
    contract.project_id,
    targetStatus,
    'contract.sync'
  );
  if (result.kind === 'ok') {
    await auditLogWrite({
      organization_id: organizationId,
      actor: 'system',
      action: 'project.status_changed',
      entity_type: 'project',
      entity_id: contract.project_id,
      metadata: {
        project_id: contract.project_id,
        from: result.from,
        to: result.to,
        reason: 'contract.sync',
      },
    });
  }
}

async function emitContractSignedEvent(
  organizationId: string,
  contract: ContractRow,
  signedBy: string
): Promise<void> {
  await auditLogWrite({
    organization_id: organizationId,
    actor: signedBy || 'system',
    action: 'contract.signed',
    entity_type: 'contract',
    entity_id: contract.id,
    metadata: {
      org_id: organizationId,
      project_id: contract.project_id,
      contract_id: contract.id,
      contract_number: contract.contract_number,
      contract_value: contract.contract_value,
    },
  });
}

/** Get contract by id scoped to project and org. */
export async function getContractByIdOrg(
  organizationId: string,
  projectId: string,
  contractId: string
): Promise<ContractRow | null> {
  return await withOrgContext(organizationId, async (client) => {
    return getContractByIdProjectOrg(client, contractId, projectId);
  });
}

/** List contracts for a project (org-safe). */
export async function listContractsByProject(
  organizationId: string,
  projectId: string
): Promise<ContractRow[]> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT id, organization_id, project_id, quote_id, contract_number, status,
        total_vnd::text as contract_value, customer_snapshot, system_snapshot, financial_snapshot,
        payment_terms, warranty_terms, construction_days,
        signed_at, signed_by, cancel_reason, created_at, updated_at
       FROM contracts WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId]
    );
    return result.rows.map((r) => mapRowToContract(r as Record<string, unknown>));
  });
}

/** F-31: List contracts v2 item (join project). */
export interface ContractListV2Item {
  id: string;
  contract_number: string;
  status: string;
  contract_value: number;
  created_at: string;
  project: {
    id: string;
    customer_name: string;
    address: string | null;
  };
}

export interface ListContractsV2Result {
  value: ContractListV2Item[];
  paging: { limit: number; offset: number; count: number };
}

/**
 * List contracts v2: join project (customer_name, address), pagination, optional status (exact case-insensitive), project_id, search (ILIKE contract_number OR project.customer_name).
 */
export async function listContractsV2(
  organizationId: string,
  limit: number,
  offset: number,
  filters?: { status?: string; search?: string; project_id?: string }
): Promise<ListContractsV2Result> {
  return await withOrgContext(organizationId, async (client) => {
    type ClauseFactory = (placeholderIndex: number) => string;
    const filterBuilders: Array<{ clauseFactory: ClauseFactory; value: string }> = [];

    if (filters?.status != null && filters.status.trim() !== '') {
      const trimmed = filters.status.trim();
      filterBuilders.push({
        value: trimmed,
        clauseFactory: (idx) => `LOWER(TRIM(contracts.status)) = LOWER(TRIM($${idx}))`,
      });
    }
    if (filters?.project_id != null && filters.project_id.trim() !== '') {
      const trimmed = filters.project_id.trim();
      filterBuilders.push({
        value: trimmed,
        clauseFactory: (idx) => `contracts.project_id = $${idx}`,
      });
    }
    if (filters?.search != null && filters.search.trim() !== '') {
      const likePattern = `%${filters.search.trim()}%`;
      filterBuilders.push({
        value: likePattern,
        clauseFactory: (idx) =>
          `(contracts.contract_number ILIKE $${idx} OR projects.customer_name ILIKE $${idx})`,
      });
    }

    const buildClauses = (baseIndex: number): string[] =>
      filterBuilders.map((builder, idx) => builder.clauseFactory(baseIndex + idx));

    const filterClauses = buildClauses(3);
    const whereClause = filterClauses.length > 0 ? ' WHERE ' + filterClauses.join(' AND ') : '';

    const result = await client.query(
      `SELECT
         contracts.id,
         contracts.contract_number,
         contracts.status,
         contracts.total_vnd as contract_value,
         contracts.created_at,
         projects.id as project_id,
         projects.customer_name,
         projects.address
       FROM contracts
       JOIN projects ON contracts.project_id = projects.id
       ${whereClause}
       ORDER BY contracts.created_at DESC, contracts.id ASC
       LIMIT $1
       OFFSET $2`,
      [limit, offset, ...filterBuilders.map((builder) => builder.value)]
    );

    const countClauses = buildClauses(1);
    const countWhere = countClauses.length > 0 ? ' WHERE ' + countClauses.join(' AND ') : '';
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM contracts
       JOIN projects ON contracts.project_id = projects.id
       ${countWhere}`,
      filterBuilders.map((builder) => builder.value)
    );

    const totalCount = parseInt(String(countResult.rows[0]?.count ?? countResult.rows[0]), 10) || 0;

    const value = (result.rows as Array<{
      id: string;
      contract_number: string;
      status: string;
      contract_value: unknown;
      created_at: string;
      project_id: string;
      customer_name: string;
      address: string | null;
    }>).map((row) => ({
      id: row.id,
      contract_number: row.contract_number,
      status: row.status,
      contract_value: row.contract_value != null ? Number(row.contract_value) : 0,
      created_at: row.created_at,
      project: {
        id: row.project_id,
        customer_name: row.customer_name,
        address: row.address,
      },
    }));

    return {
      value,
      paging: { limit, offset, count: totalCount },
    };
  });
}

/** F-35: Contract detail v2 (join project, quote, customer, latest handover; optional snapshots). */
export interface ContractDetailV2 {
  id: string;
  contract_number: string;
  status: string;
  created_at: string;
  project: { id: string; customer_name: string; address: string | null; status: string } | null;
  quote: { id: string; status: string; price_total: number | null; payload: Record<string, unknown> } | null;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  handover: { id: string; status: string } | null;
  customer_snapshot?: Record<string, unknown>;
  system_snapshot?: Record<string, unknown>;
  financial_snapshot?: Record<string, unknown>;
  payment_terms?: unknown;
}

/**
 * Get contract detail v2 by id (org-scoped). Joins project, quote, customer (via quote), latest handover by project_id.
 * Returns null if contract not found in org. Missing relations → null for that object.
 */
export async function getContractDetailV2(
  id: string,
  organizationId: string
): Promise<ContractDetailV2 | null> {
  return await withOrgContext(organizationId, async (client) => {
    const contractResult = await client.query(
      `SELECT id, organization_id, project_id, quote_id, contract_number, status, created_at,
        customer_snapshot, system_snapshot, financial_snapshot, payment_terms
       FROM contracts WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (contractResult.rows.length === 0) {
      return null;
    }
    const c = contractResult.rows[0] as {
      id: string;
      organization_id: string;
      project_id: string;
      quote_id: string;
      contract_number: string;
      status: string;
      created_at: string;
      customer_snapshot: unknown;
      system_snapshot: unknown;
      financial_snapshot: unknown;
      payment_terms: unknown;
    };

    let project: { id: string; customer_name: string; address: string | null; status: string } | null = null;
    const projResult = await client.query(
      `SELECT id, customer_name, address, COALESCE(status, 'NEW') as status FROM projects WHERE id = $1 LIMIT 1`,
      [c.project_id]
    );
    if (projResult.rows.length > 0) {
      const p = projResult.rows[0] as { id: string; customer_name: string; address: string | null; status: string };
      project = { id: p.id, customer_name: p.customer_name, address: p.address, status: p.status };
    }

    let quote: { id: string; status: string; price_total: number | null; payload: Record<string, unknown>; customer_name?: string | null; customer_phone?: string | null; customer_email?: string | null } | null = null;
    let quoteCustomerId: string | null = null;
    const quoteResult = await client.query(
      `SELECT id, status, total_vnd as price_total, customer_name, customer_phone, customer_email FROM quotes WHERE id = $1 LIMIT 1`,
      [c.quote_id]
    );
    if (quoteResult.rows.length > 0) {
      const q = quoteResult.rows[0] as { id: string; status: string; price_total: unknown; customer_name: string | null; customer_phone: string | null; customer_email: string | null };
      quote = {
        id: q.id,
        status: q.status,
        price_total: q.price_total != null ? Number(q.price_total) : null,
        payload: {}, // Schema 034: quotes doesn't have payload
        customer_name: q.customer_name,
        customer_phone: q.customer_phone,
        customer_email: q.customer_email,
      };
      // Try to find customer by snapshot data
      if (q.customer_name || q.customer_phone || q.customer_email) {
        const custResult = await client.query(
          `SELECT id, name, phone, email FROM customers 
           WHERE organization_id = (current_setting('app.current_org_id', true))::uuid
           AND (name = $1 OR phone = $2 OR email = $3) LIMIT 1`,
          [q.customer_name || '', q.customer_phone || '', q.customer_email || '']
        );
        if (custResult.rows.length > 0) {
          quoteCustomerId = (custResult.rows[0] as { id: string }).id;
        }
      }
    }

    let customer: { id: string; name: string; phone: string | null; email: string | null } | null = null;
    if (quoteCustomerId) {
      const custResult = await client.query(
        `SELECT id, name, phone, email FROM customers WHERE id = $1 LIMIT 1`,
        [quoteCustomerId]
      );
      if (custResult.rows.length > 0) {
        const cu = custResult.rows[0] as { id: string; name: string; phone: string | null; email: string | null };
        customer = { id: cu.id, name: cu.name, phone: cu.phone, email: cu.email };
      }
    } else if (quote && quote.customer_name) {
      // Fallback: use snapshot from quote
      customer = {
        id: '',
        name: quote.customer_name,
        phone: quote.customer_phone || null,
        email: quote.customer_email || null,
      };
    }

    let handover: { id: string; status: string } | null = null;
    // Schema 038: handovers doesn't have project_id, get via contract
    const hoResult = await client.query(
      `SELECT h.id, h.handover_type as status FROM handovers h 
       WHERE h.contract_id = $1 ORDER BY h.created_at DESC LIMIT 1`,
      [c.id]
    );
    if (hoResult.rows.length > 0) {
      const h = hoResult.rows[0] as { id: string; status: string };
      handover = { id: h.id, status: h.status };
    }

    const out: ContractDetailV2 = {
      id: c.id,
      contract_number: c.contract_number,
      status: c.status,
      created_at: c.created_at,
      project,
      quote,
      customer,
      handover,
    };
    if (c.customer_snapshot != null && typeof c.customer_snapshot === 'object') {
      out.customer_snapshot = c.customer_snapshot as Record<string, unknown>;
    }
    if (c.system_snapshot != null && typeof c.system_snapshot === 'object') {
      out.system_snapshot = c.system_snapshot as Record<string, unknown>;
    }
    if (c.financial_snapshot != null && typeof c.financial_snapshot === 'object') {
      out.financial_snapshot = c.financial_snapshot as Record<string, unknown>;
    }
    if (c.payment_terms !== undefined && c.payment_terms !== null) {
      out.payment_terms = c.payment_terms;
    }
    return out;
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidContractId(id: string): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

const IMMUTABLE_FIELDS = ['customer_snapshot', 'system_snapshot', 'financial_snapshot', 'contract_value'];

/**
 * Enforce IMMUTABLE after SIGNED: reject updates to customer_snapshot, system_snapshot,
 * financial_snapshot, contract_value. Used by any update/patch handler.
 */
export function assertNotImmutableUpdate(
  currentStatus: string,
  patch: Record<string, unknown>
): void {
  const upper = (currentStatus || '').toUpperCase();
  if (upper !== CONTRACT_STATUS.SIGNED && upper !== CONTRACT_STATUS.INSTALLING &&
      upper !== CONTRACT_STATUS.HANDOVER && upper !== CONTRACT_STATUS.COMPLETED) {
    return;
  }
  for (const key of IMMUTABLE_FIELDS) {
    if (key in patch && patch[key] !== undefined) {
      throw new Error('Contract is immutable after sign; cannot update snapshot or contract_value');
    }
  }
}

/** Patch payload: only warranty_terms and construction_days are updatable (when draft). */
export type ContractPatch = Partial<{
  warranty_terms: string | null;
  construction_days: number | null;
  customer_snapshot: Record<string, unknown>;
  system_snapshot: Record<string, unknown>;
  financial_snapshot: Record<string, unknown>;
  contract_value: number;
}>;

export type UpdateContractResult =
  | { kind: 'not_found' }
  | { kind: 'locked' }
  | { kind: 'immutable' }
  | { kind: 'ok'; contract: ContractRow };

/**
 * Update contract. F-36: Reject all PATCH when status is SIGNED or COMPLETED (locked).
 * Otherwise rejects immutable when status is signed+ and patch contains snapshot/contract_value.
 */
export async function updateContract(
  organizationId: string,
  projectId: string,
  contractId: string,
  patch: ContractPatch
): Promise<UpdateContractResult> {
  return await withOrgContext(organizationId, async (client) => {
    const exist = await client.query(
      'SELECT id, status FROM contracts WHERE id = $1 AND project_id = $2',
      [contractId, projectId]
    );
    if (exist.rows.length === 0) {
      return { kind: 'not_found' };
    }
    const currentStatus = (exist.rows[0] as { status: string }).status;
    const statusUpper = (currentStatus || '').toUpperCase();
    if (statusUpper === CONTRACT_STATUS.SIGNED || statusUpper === CONTRACT_STATUS.COMPLETED) {
      return { kind: 'locked' };
    }
    try {
      assertNotImmutableUpdate(currentStatus, patch as Record<string, unknown>);
    } catch {
      return { kind: 'immutable' };
    }
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (patch.warranty_terms !== undefined) {
      updates.push(`warranty_terms = $${idx}`);
      values.push(patch.warranty_terms);
      idx += 1;
    }
    if (patch.construction_days !== undefined) {
      updates.push(`construction_days = $${idx}`);
      values.push(patch.construction_days);
      idx += 1;
    }
    if (updates.length === 0) {
      const c = await getContractByIdProjectOrg(client, contractId, projectId);
      return c ? { kind: 'ok', contract: c } : { kind: 'not_found' };
    }
    values.push(contractId, projectId);
    await client.query(
      `UPDATE contracts SET ${updates.join(', ')}, updated_at = now() WHERE id = $${idx} AND project_id = $${idx + 1}`,
      values
    );
    const contract = await getContractByIdProjectOrg(client, contractId, projectId);
    return contract ? { kind: 'ok', contract } : { kind: 'not_found' };
  });
}
