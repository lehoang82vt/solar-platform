/**
 * CON-03 / CON-04: Contract lifecycle and immutability (037 schema).
 * Sign (customer + company), transitions SIGNED→IN_PROGRESS→COMPLETED, cancel, timeline.
 * Update allowed only when status = DRAFT.
 */
import { withOrgContext } from '../config/database';
import { write as auditLogWrite } from './auditLog';
import { CONTRACT_STATE_TRANSITIONS } from '../../../shared/src/constants/states';
import { eventBus } from './event-bus';

const STATUS_DRAFT = 'DRAFT';
const STATUS_SIGNED = 'SIGNED';
const STATUS_IN_PROGRESS = 'IN_PROGRESS';
const STATUS_COMPLETED = 'COMPLETED';
const STATUS_CANCELLED = 'CANCELLED';

const CANCELLABLE = new Set([STATUS_DRAFT, STATUS_SIGNED, STATUS_IN_PROGRESS]);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(s: string): boolean {
  return typeof s === 'string' && UUID_REGEX.test(s);
}

export interface Contract037Row {
  id: string;
  organization_id: string;
  project_id: string;
  quote_id: string | null;
  contract_number: string;
  status: string;
  deposit_percentage: number | null;
  deposit_vnd: number | null;
  final_payment_vnd: number | null;
  total_vnd: number;
  expected_start_date: string | null;
  expected_completion_date: string | null;
  actual_start_date: string | null;
  actual_completion_date: string | null;
  warranty_years: number | null;
  customer_signed_at: string | null;
  customer_signature_url: string | null;
  company_signed_at: string | null;
  company_signed_by: string | null;
  notes: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

function rowFromDb(row: Record<string, unknown>): Contract037Row {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    project_id: row.project_id as string,
    quote_id: (row.quote_id as string) ?? null,
    contract_number: row.contract_number as string,
    status: (row.status as string) ?? STATUS_DRAFT,
    deposit_percentage: row.deposit_percentage != null ? Number(row.deposit_percentage) : null,
    deposit_vnd: row.deposit_vnd != null ? Number(row.deposit_vnd) : null,
    final_payment_vnd: row.final_payment_vnd != null ? Number(row.final_payment_vnd) : null,
    total_vnd: Number(row.total_vnd ?? 0),
    expected_start_date: (row.expected_start_date as string) ?? null,
    expected_completion_date: (row.expected_completion_date as string) ?? null,
    actual_start_date: (row.actual_start_date as string) ?? null,
    actual_completion_date: (row.actual_completion_date as string) ?? null,
    warranty_years: row.warranty_years != null ? Number(row.warranty_years) : null,
    customer_signed_at: (row.customer_signed_at as string) ?? null,
    customer_signature_url: (row.customer_signature_url as string) ?? null,
    company_signed_at: (row.company_signed_at as string) ?? null,
    company_signed_by: (row.company_signed_by as string) ?? null,
    notes: (row.notes as string) ?? null,
    cancellation_reason: (row.cancellation_reason as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

const CONTRACT_SELECT =
  `id, organization_id, project_id, quote_id, contract_number, status,
   deposit_percentage, deposit_vnd, final_payment_vnd, total_vnd,
   expected_start_date, expected_completion_date, actual_start_date, actual_completion_date,
   warranty_years, customer_signed_at, customer_signature_url, company_signed_at, company_signed_by,
   notes, cancellation_reason, created_at, updated_at`;

async function getContract037(
  client: { query: (q: string, p: unknown[]) => Promise<{ rows: unknown[] }> },
  organizationId: string,
  contractId: string
): Promise<Contract037Row | null> {
  const result = await client.query(
    `SELECT ${CONTRACT_SELECT} FROM contracts WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [contractId, organizationId]
  );
  if (result.rows.length === 0) return null;
  return rowFromDb(result.rows[0] as Record<string, unknown>);
}

/** Get contract by id (org-scoped). */
export async function getContractByIdOrg037(
  organizationId: string,
  contractId: string
): Promise<Contract037Row | null> {
  return await withOrgContext(organizationId, async (client) => {
    return getContract037(client, organizationId, contractId);
  });
}

export type SignContractInput = {
  /** Set customer signed now. */
  customer_signed?: boolean;
  /** Set company signed now; value is user id. */
  company_signed_by?: string;
};

export type SignContractResult =
  | { kind: 'not_found' }
  | { kind: 'invalid_state'; status: string }
  | { kind: 'ok'; contract: Contract037Row; fromStatus: string };

/**
 * Sign contract: set customer_signed_at and/or company_signed_at + company_signed_by.
 * When both are set, status becomes SIGNED.
 */
export async function signContract(
  organizationId: string,
  contractId: string,
  input: SignContractInput
): Promise<SignContractResult> {
  return await withOrgContext(organizationId, async (client) => {
    const contract = await getContract037(client, organizationId, contractId);
    if (!contract) return { kind: 'not_found' };
    const statusUpper = (contract.status || '').toUpperCase();
    if (statusUpper !== STATUS_DRAFT) {
      return { kind: 'invalid_state', status: contract.status };
    }

    const updates: string[] = ['updated_at = now()'];
    const values: unknown[] = [];
    let idx = 1;
    if (input.customer_signed) {
      updates.push(`customer_signed_at = COALESCE(customer_signed_at, now())`);
    }
    if (input.company_signed_by != null && input.company_signed_by !== '') {
      updates.push(`company_signed_at = COALESCE(company_signed_at, now())`);
      if (isValidUuid(input.company_signed_by)) {
        updates.push(`company_signed_by = COALESCE(company_signed_by, $${idx})`);
        values.push(input.company_signed_by);
        idx += 1;
      }
    }
    if (updates.length <= 1) {
      const c = await getContract037(client, organizationId, contractId);
      return c ? { kind: 'ok', contract: c, fromStatus: statusUpper } : { kind: 'not_found' };
    }

    await client.query(
      `UPDATE contracts SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1}`,
      [...values, contractId, organizationId]
    );

    const after = await getContract037(client, organizationId, contractId);
    if (!after) return { kind: 'not_found' };

    const bothSigned = !!after.customer_signed_at && !!after.company_signed_at;
    if (bothSigned && after.status === STATUS_DRAFT) {
      await client.query(
        `UPDATE contracts SET status = $1, updated_at = now() WHERE id = $2 AND organization_id = $3`,
        [STATUS_SIGNED, contractId, organizationId]
      );
      const signedContract = await getContract037(client, organizationId, contractId);
      if (signedContract) {
        await auditLogWrite({
          organization_id: organizationId,
          actor: input.company_signed_by ?? 'system',
          action: 'contract.signed',
          entity_type: 'contract',
          entity_id: contractId,
          metadata: {
            contract_id: contractId,
            contract_number: after.contract_number,
            customer_signed_at: after.customer_signed_at,
            company_signed_at: after.company_signed_at,
          },
        });
        await eventBus.emit({
          type: 'contract.signed',
          organizationId,
          data: { contract_id: contractId, contract_number: after.contract_number },
        });
        return { kind: 'ok', contract: signedContract, fromStatus: statusUpper };
      }
    }

    return { kind: 'ok', contract: after, fromStatus: statusUpper };
  });
}

export type TransitionContractResult =
  | { kind: 'not_found' }
  | { kind: 'invalid_to_status'; to_status: string }
  | { kind: 'invalid_state'; current: string; to_status: string }
  | { kind: 'ok'; contract: Contract037Row; fromStatus: string };

const VALID_NEXT: Record<string, string[]> = {
  [STATUS_SIGNED]: [STATUS_IN_PROGRESS],
  [STATUS_IN_PROGRESS]: [STATUS_COMPLETED],
};

/**
 * Transition contract: SIGNED → IN_PROGRESS (set actual_start_date), IN_PROGRESS → COMPLETED (set actual_completion_date).
 */
export async function transitionContract(
  organizationId: string,
  contractId: string,
  toStatus: string
): Promise<TransitionContractResult> {
  const toUpper = (toStatus || '').toUpperCase();
  if (toUpper !== STATUS_IN_PROGRESS && toUpper !== STATUS_COMPLETED) {
    return { kind: 'invalid_to_status', to_status: toStatus };
  }

  return await withOrgContext(organizationId, async (client) => {
    const contract = await getContract037(client, organizationId, contractId);
    if (!contract) return { kind: 'not_found' };
    const current = (contract.status || '').toUpperCase();
    const allowed = VALID_NEXT[current];
    if (!allowed || !allowed.includes(toUpper)) {
      return { kind: 'invalid_state', current, to_status: toUpper };
    }

    if (toUpper === STATUS_IN_PROGRESS) {
      await client.query(
        `UPDATE contracts SET status = $1, actual_start_date = COALESCE(actual_start_date, CURRENT_DATE), updated_at = now()
         WHERE id = $2 AND organization_id = $3`,
        [STATUS_IN_PROGRESS, contractId, organizationId]
      );
    } else {
      await client.query(
        `UPDATE contracts SET status = $1, actual_completion_date = COALESCE(actual_completion_date, CURRENT_DATE), updated_at = now()
         WHERE id = $2 AND organization_id = $3`,
        [STATUS_COMPLETED, contractId, organizationId]
      );
    }

    const updated = await getContract037(client, organizationId, contractId);
    return updated ? { kind: 'ok', contract: updated, fromStatus: current } : { kind: 'not_found' };
  });
}

export type CancelContractResult =
  | { kind: 'not_found' }
  | { kind: 'invalid_state'; status: string }
  | { kind: 'reason_required' }
  | { kind: 'ok'; contract: Contract037Row; fromStatus: string };

/** Cancel contract. Reason required. Only from DRAFT, SIGNED, or IN_PROGRESS. */
export async function cancelContract(
  organizationId: string,
  contractId: string,
  reason: string
): Promise<CancelContractResult> {
  const trimmed = reason?.toString().trim();
  if (!trimmed) return { kind: 'reason_required' };

  return await withOrgContext(organizationId, async (client) => {
    const contract = await getContract037(client, organizationId, contractId);
    if (!contract) return { kind: 'not_found' };
    const current = (contract.status || '').toUpperCase();
    if (!CANCELLABLE.has(current)) {
      return { kind: 'invalid_state', status: contract.status };
    }
    await client.query(
      `UPDATE contracts SET status = $1, cancellation_reason = $2, updated_at = now() WHERE id = $3 AND organization_id = $4`,
      [STATUS_CANCELLED, trimmed, contractId, organizationId]
    );
    const updated = await getContract037(client, organizationId, contractId);
    return updated ? { kind: 'ok', contract: updated, fromStatus: current } : { kind: 'not_found' };
  });
}

export type UpdateContractPatch = Partial<{
  notes: string | null;
  expected_start_date: string | null;
  expected_completion_date: string | null;
}>;

export type UpdateContractResult =
  | { kind: 'not_found' }
  | { kind: 'locked'; status: string }
  | { kind: 'ok'; contract: Contract037Row };

/**
 * Update contract. Allowed only when status = DRAFT (CON-04 immutability).
 */
export async function updateContract(
  organizationId: string,
  contractId: string,
  patch: UpdateContractPatch
): Promise<UpdateContractResult> {
  return await withOrgContext(organizationId, async (client) => {
    const contract = await getContract037(client, organizationId, contractId);
    if (!contract) return { kind: 'not_found' };
    const statusUpper = (contract.status || '').toUpperCase();
    if (statusUpper !== STATUS_DRAFT) {
      return { kind: 'locked', status: contract.status };
    }

    const updates: string[] = ['updated_at = now()'];
    const values: unknown[] = [];
    let idx = 1;
    if (patch.notes !== undefined) {
      updates.push(`notes = $${idx}`);
      values.push(patch.notes);
      idx += 1;
    }
    if (patch.expected_start_date !== undefined) {
      updates.push(`expected_start_date = $${idx}`);
      values.push(patch.expected_start_date);
      idx += 1;
    }
    if (patch.expected_completion_date !== undefined) {
      updates.push(`expected_completion_date = $${idx}`);
      values.push(patch.expected_completion_date);
      idx += 1;
    }
    if (updates.length <= 1) {
      return { kind: 'ok', contract };
    }
    values.push(contractId, organizationId);
    await client.query(
      `UPDATE contracts SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1}`,
      values
    );
    const updated = await getContract037(client, organizationId, contractId);
    return updated ? { kind: 'ok', contract: updated } : { kind: 'not_found' };
  });
}

export interface TimelineEvent {
  at: string;
  event: string;
  detail?: Record<string, unknown>;
}

/**
 * Timeline: created, customer_signed, company_signed, started (actual_start_date), completed (actual_completion_date), cancelled.
 */
export async function getContractTimeline(
  organizationId: string,
  contractId: string
): Promise<{ contract: Contract037Row | null; events: TimelineEvent[] }> {
  const contract = await getContractByIdOrg037(organizationId, contractId);
  if (!contract) return { contract: null, events: [] };

  const events: TimelineEvent[] = [];
  events.push({ at: contract.created_at, event: 'created' });
  if (contract.customer_signed_at) {
    events.push({ at: contract.customer_signed_at, event: 'customer_signed' });
  }
  if (contract.company_signed_at) {
    events.push({
      at: contract.company_signed_at,
      event: 'company_signed',
      detail: contract.company_signed_by ? { company_signed_by: contract.company_signed_by } : undefined,
    });
  }
  if (contract.actual_start_date) {
    events.push({ at: contract.actual_start_date, event: 'started', detail: { actual_start_date: contract.actual_start_date } });
  }
  if (contract.actual_completion_date) {
    events.push({ at: contract.actual_completion_date, event: 'completed', detail: { actual_completion_date: contract.actual_completion_date } });
  }
  if ((contract.status || '').toUpperCase() === STATUS_CANCELLED && contract.cancellation_reason) {
    events.push({
      at: contract.updated_at,
      event: 'cancelled',
      detail: { cancellation_reason: contract.cancellation_reason },
    });
  }
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return { contract, events };
}

/** Validate that a transition from current to toStatus is allowed (CONTRACT_STATE_TRANSITIONS). */
export function validateTransition(current: string, toStatus: string): boolean {
  const cur = (current || '').toUpperCase();
  const to = (toStatus || '').toUpperCase();
  const allowed = CONTRACT_STATE_TRANSITIONS[cur as keyof typeof CONTRACT_STATE_TRANSITIONS];
  return Array.isArray(allowed) && allowed.includes(to as never);
}
