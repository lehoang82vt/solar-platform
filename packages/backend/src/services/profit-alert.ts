/**
 * PRO-02: Profit alerts – alert on WARNING/BLOCK, mode low_only vs always, recipients, financial data.
 */
import type { GateStatus } from './profit-gate';

export type AlertMode = 'low_only' | 'always';

export interface ProfitAlertOptions {
  /** low_only = alert only when WARNING/BLOCK; always = include message for PASS too (PASS = info, not warning). */
  mode?: AlertMode;
  /** Recipient emails for the alert. */
  recipients?: string[];
  /** Financial data to include in alert (margin, level, etc.). */
  financialData?: Record<string, unknown>;
}

export interface ProfitAlertPayload {
  /** Alert level: warning or block. */
  level: 'WARNING' | 'BLOCK';
  /** Recipient emails. */
  to: string[];
  /** Short subject. */
  subject: string;
  /** Body text. */
  body: string;
  /** Financial data included in alert. */
  financialData: Record<string, unknown>;
}

/**
 * Build profit alert payload when gate is WARNING or BLOCK.
 * PASS never produces an alert (no alert on PASS).
 * Alert contains financial data and recipients when provided.
 */
export function buildProfitAlert(
  gateStatus: GateStatus | string | null | undefined,
  options: ProfitAlertOptions = {}
): ProfitAlertPayload | null {
  const normalized = (gateStatus ?? '').toString().trim().toUpperCase();
  const recipients = options.recipients ?? [];
  const financialData = options.financialData ?? {};

  if (normalized === 'PASS') {
    return null; // No alert on PASS
  }

  if (normalized === 'WARNING') {
    return {
      level: 'WARNING',
      to: recipients,
      subject: 'Profit gate WARNING',
      body: 'Profit gate WARNING: margin or validation below threshold.',
      financialData: { ...financialData, level: 'WARNING' },
    };
  }

  if (normalized === 'BLOCK') {
    return {
      level: 'BLOCK',
      to: recipients,
      subject: 'Profit gate BLOCKED',
      body: 'Profit gate BLOCKED: submission not allowed.',
      financialData: { ...financialData, level: 'BLOCK' },
    };
  }

  return null;
}

/**
 * Whether an alert should be sent for the given status.
 * Alert on WARNING/BLOCK; no alert on PASS.
 */
export function shouldSendProfitAlert(
  gateStatus: GateStatus | string | null | undefined
): boolean {
  const normalized = (gateStatus ?? '').toString().trim().toUpperCase();
  return normalized === 'WARNING' || normalized === 'BLOCK';
}
