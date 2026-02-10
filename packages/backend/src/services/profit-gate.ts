/**
 * PRO-01: Profit gate enforcement – BLOCK / WARNING / super_admin bypass.
 * Use at quote submit, quote approve, contract create.
 */
import { write as auditLogWrite } from './auditLog';

export type GateStatus = 'PASS' | 'WARNING' | 'BLOCK';

export interface GateCheckOptions {
  /** User role; if equals superAdminRole, BLOCK is bypassed. */
  userRole?: string;
  /** Role that can bypass BLOCK. Default 'super_admin'. */
  superAdminRole?: string;
  /** For audit when bypassed. */
  organizationId?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
}

export interface GateResult {
  allowed: boolean;
  /** Present when gate is WARNING (allowed but alert). */
  alert?: string;
  /** True when BLOCK was bypassed by super admin. */
  bypassed?: boolean;
  /** Reason when not allowed (e.g. BLOCK). */
  reason?: string;
}

const DEFAULT_SUPER_ADMIN_ROLE = 'super_admin';
const WARNING_ALERT = 'Profit gate WARNING: margin or validation below threshold';
const BLOCK_REASON = 'Profit gate BLOCKED';

/**
 * Check profit gate. BLOCK → not allowed unless super admin. WARNING → allowed with alert. PASS → allowed.
 */
export function checkGate(status: GateStatus | string | null | undefined, options: GateCheckOptions = {}): GateResult {
  const normalized = (status ?? '').toString().trim().toUpperCase();
  const superAdminRole = (options.superAdminRole ?? DEFAULT_SUPER_ADMIN_ROLE).trim().toLowerCase();
  const userRole = (options.userRole ?? '').trim().toLowerCase();

  if (normalized === 'BLOCK') {
    if (userRole === superAdminRole) {
      return { allowed: true, bypassed: true };
    }
    return { allowed: false, reason: BLOCK_REASON };
  }

  if (normalized === 'WARNING') {
    return { allowed: true, alert: WARNING_ALERT };
  }

  return { allowed: true };
}

/**
 * Check gate and write audit log when bypassed. Use at enforcement points.
 */
export async function checkGateWithAudit(
  status: GateStatus | string | null | undefined,
  options: GateCheckOptions
): Promise<GateResult> {
  const result = checkGate(status, options);
  if (result.bypassed && options.organizationId && options.userId) {
    await auditLogWrite({
      organization_id: options.organizationId,
      actor: options.userId,
      action: 'profit_gate.bypass',
      entity_type: options.entityType ?? 'gate',
      entity_id: options.entityId ?? undefined,
      metadata: {
        gate_status: (status ?? '').toString(),
        action: options.action,
        user_role: options.userRole,
      },
    });
  }
  return result;
}

/** Reject if gate blocks (no bypass). Use before quote submit. */
export function enforceQuoteSubmitGate(
  status: GateStatus | string | null | undefined,
  options: GateCheckOptions = {}
): void {
  const result = checkGate(status, options);
  if (!result.allowed) {
    throw new Error(result.reason ?? 'Quote submit BLOCKED');
  }
}

/** Reject if gate blocks (no bypass). Use before quote approve. */
export function enforceQuoteApproveGate(
  status: GateStatus | string | null | undefined,
  options: GateCheckOptions = {}
): void {
  const result = checkGate(status, options);
  if (!result.allowed) {
    throw new Error(result.reason ?? 'Quote approval BLOCKED');
  }
}

/** Reject if gate blocks (no bypass). Use before contract create. */
export function enforceContractCreateGate(
  status: GateStatus | string | null | undefined,
  options: GateCheckOptions = {}
): void {
  const result = checkGate(status, options);
  if (!result.allowed) {
    throw new Error(result.reason ?? 'Contract create BLOCKED');
  }
}
