/**
 * CON-05: Handover management with commission hold (038 schema).
 * Installation handover, checklist, photos, 7-day cancel window for commission.
 */
import { withOrgContext } from '../config/database';

const HANDOVER_TYPE_INSTALLATION = 'INSTALLATION';
const COMMISSION_HOLD_DAYS = 7;
const CONTRACT_STATUS_COMPLETED = 'COMPLETED';

export interface Handover038Row {
  id: string;
  organization_id: string;
  contract_id: string;
  handover_type: string;
  handover_date: string;
  performed_by: string | null;
  accepted_by: string | null;
  checklist: Record<string, unknown> | null;
  photos: string[];
  notes: string | null;
  cancelled_at: string | null;
  created_at: string;
}

function rowFromDb(row: Record<string, unknown>): Handover038Row {
  const photos = row.photos;
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    contract_id: row.contract_id as string,
    handover_type: row.handover_type as string,
    handover_date: row.handover_date as string,
    performed_by: (row.performed_by as string) ?? null,
    accepted_by: (row.accepted_by as string) ?? null,
    checklist: (row.checklist as Record<string, unknown>) ?? null,
    photos: Array.isArray(photos) ? (photos as string[]) : [],
    notes: (row.notes as string) ?? null,
    cancelled_at: (row.cancelled_at as string) ?? null,
    created_at: row.created_at as string,
  };
}

export interface CreateHandoverInput {
  handover_date: string; // YYYY-MM-DD
  checklist?: Record<string, unknown>;
  photos?: string[];
  notes?: string | null;
  performed_by?: string | null;
  accepted_by?: string | null;
}

export type CreateHandoverResult =
  | { kind: 'contract_not_found' }
  | { kind: 'invalid_contract_state'; status: string }
  | { kind: 'ok'; handover: Handover038Row };

/**
 * Create installation handover. Auto-completes the contract.
 * Commission is held until 7 days after handover_date.
 */
export async function createInstallationHandover(
  organizationId: string,
  contractId: string,
  input: CreateHandoverInput
): Promise<CreateHandoverResult> {
  return await withOrgContext(organizationId, async (client) => {
    const contractResult = await client.query(
      `SELECT id, status FROM contracts WHERE id = $1 AND organization_id = $2`,
      [contractId, organizationId]
    );
    if (contractResult.rows.length === 0) return { kind: 'contract_not_found' };
    const status = (contractResult.rows[0] as { status: string }).status;
    const statusUpper = (status || '').toUpperCase();
    if (statusUpper === CONTRACT_STATUS_COMPLETED) {
      return { kind: 'invalid_contract_state', status };
    }

    const handoverResult = await client.query(
      `INSERT INTO handovers (
        organization_id, contract_id, handover_type, handover_date,
        performed_by, accepted_by, checklist, photos, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        organizationId,
        contractId,
        HANDOVER_TYPE_INSTALLATION,
        input.handover_date,
        input.performed_by ?? null,
        input.accepted_by ?? null,
        input.checklist ? JSON.stringify(input.checklist) : null,
        input.photos && input.photos.length > 0 ? input.photos : null,
        input.notes ?? null,
      ]
    );

    await client.query(
      `UPDATE contracts SET status = $1, actual_completion_date = COALESCE(actual_completion_date, $2::date), updated_at = now()
       WHERE id = $3 AND organization_id = $4`,
      [CONTRACT_STATUS_COMPLETED, input.handover_date, contractId, organizationId]
    );

    const row = handoverResult.rows[0] as Record<string, unknown>;
    const handover = rowFromDb(row);
    return { kind: 'ok', handover };
  });
}

export type CancelHandoverResult =
  | { kind: 'not_found' }
  | { kind: 'already_cancelled' }
  | { kind: 'ok'; handover: Handover038Row };

/** Cancel handover. Within 7 days of handover_date blocks commission; after 7 days releases commission. */
export async function cancelHandover(
  organizationId: string,
  handoverId: string
): Promise<CancelHandoverResult> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT id, organization_id, cancelled_at FROM handovers WHERE id = $1 AND organization_id = $2`,
      [handoverId, organizationId]
    );
    if (result.rows.length === 0) return { kind: 'not_found' };
    const row = result.rows[0] as { cancelled_at: string | null };
    if (row.cancelled_at) return { kind: 'already_cancelled' };

    await client.query(
      `UPDATE handovers SET cancelled_at = now() WHERE id = $1 AND organization_id = $2`,
      [handoverId, organizationId]
    );
    const updated = await getHandoverById(client, organizationId, handoverId);
    return updated ? { kind: 'ok', handover: updated } : { kind: 'not_found' };
  });
}

async function getHandoverById(
  client: { query: (q: string, p: unknown[]) => Promise<{ rows: unknown[] }> },
  organizationId: string,
  handoverId: string
): Promise<Handover038Row | null> {
  const result = await client.query(
    `SELECT id, organization_id, contract_id, handover_type, handover_date,
        performed_by, accepted_by, checklist, photos, notes, cancelled_at, created_at
     FROM handovers WHERE id = $1 AND organization_id = $2`,
    [handoverId, organizationId]
  );
  if (result.rows.length === 0) return null;
  return rowFromDb(result.rows[0] as Record<string, unknown>);
}

export async function getHandoverByIdOrg(
  organizationId: string,
  handoverId: string
): Promise<Handover038Row | null> {
  return await withOrgContext(organizationId, async (client) => {
    return getHandoverById(client, organizationId, handoverId);
  });
}

/** Commission is held until this many days after handover_date. */
export const COMMISSION_HOLD_DAYS_EXPORT = COMMISSION_HOLD_DAYS;

/**
 * End of commission hold window (midnight UTC after handover_date + 7 days).
 */
export function commissionHoldEndsAt(handover: Handover038Row): Date {
  const d = new Date(handover.handover_date);
  d.setUTCDate(d.getUTCDate() + COMMISSION_HOLD_DAYS);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** True if handover was cancelled within 7 days (commission blocked). */
export function isCommissionBlocked(handover: Handover038Row): boolean {
  if (!handover.cancelled_at) return false;
  const endsAt = commissionHoldEndsAt(handover);
  return new Date(handover.cancelled_at) < endsAt;
}

/** True if commission can be released (either 7 days passed without cancel, or cancelled after 7 days). */
export function isCommissionReleased(handover: Handover038Row): boolean {
  const endsAt = commissionHoldEndsAt(handover);
  const now = new Date();
  if (!handover.cancelled_at) return now >= endsAt;
  return new Date(handover.cancelled_at) >= endsAt;
}
