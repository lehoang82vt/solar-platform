/**
 * CON-02: Create contract from approved quote.
 * Payment terms (deposit %), snapshots, audit trail.
 * Supports 034 quote schema (project_id, total_vnd, customer_name, etc.).
 */
import { randomBytes } from 'node:crypto';
import { withOrgContext } from '../config/database';
import { isQuoteApproved } from './contracts';
import { write as auditLogWrite, checkSalesBlocked } from './auditLog';

/** Quote row shape for 034 schema (project_id, total_vnd, customer_*). */
interface QuoteForContract {
  id: string;
  project_id: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  total_vnd: number | null;
  financial_snapshot: Record<string, unknown> | null;
}

async function getQuoteForContract(
  quoteId: string,
  organizationId: string
): Promise<QuoteForContract | null> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT id, project_id, status, customer_name, customer_phone, customer_email,
              total_vnd, financial_snapshot
       FROM quotes WHERE id = $1 LIMIT 1`,
      [quoteId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as {
      id: string;
      project_id: string;
      status: string;
      customer_name: string | null;
      customer_phone: string | null;
      customer_email: string | null;
      total_vnd: string | number | null;
      financial_snapshot: unknown;
    };
    return {
      id: row.id,
      project_id: row.project_id,
      status: row.status,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      customer_email: row.customer_email,
      total_vnd: row.total_vnd != null ? Number(row.total_vnd) : null,
      financial_snapshot:
        row.financial_snapshot != null && typeof row.financial_snapshot === 'object'
          ? (row.financial_snapshot as Record<string, unknown>)
          : null,
    };
  });
}

const CONTRACT_STATUS_DRAFT = 'DRAFT';
const DEFAULT_DEPOSIT_PERCENTAGE = 30;
const DEFAULT_WARRANTY_YEARS = 10;

export interface CreateContractFromQuoteInput {
  deposit_percentage?: number;
  expected_start_date?: Date;
  expected_completion_date?: Date;
  warranty_years?: number;
  /** Optional actor for audit log (default 'system'). */
  actor?: string;
}

export interface CreateContractFromQuoteResult {
  id: string;
  organization_id: string;
  project_id: string;
  quote_id: string;
  contract_number: string;
  status: string;
  contract_value: string;
  deposit_vnd: number;
  final_payment_vnd: number;
  total_vnd: number;
  deposit_percentage: number;
  warranty_years: number;
  customer_snapshot: Record<string, unknown>;
  system_snapshot: Record<string, unknown>;
  financial_snapshot: Record<string, unknown>;
  payment_terms: Array<{ milestone: string; pct: number }>;
  created_at: string;
  updated_at: string;
}

export type CreateContractFromQuoteOutcome =
  | { kind: 'ok'; contract: CreateContractFromQuoteResult }
  | { kind: 'quote_not_found' }
  | { kind: 'quote_not_accepted'; status: string }
  | { kind: 'quote_project_required' }
  | { kind: 'quote_price_total_required' };

function generateContractNumber(): string {
  const timestamp = Date.now();
  const random = randomBytes(4).toString('hex');
  return `C-${timestamp}-${random}`;
}

/**
 * Create contract from quote. Quote must be CUSTOMER_ACCEPTED (or accepted/approved).
 * Generates contract_number C-{timestamp}-{random}, calculates deposit and final payment,
 * snapshots quote data, writes audit trail.
 */
export async function createContractFromQuote(
  organizationId: string,
  quoteId: string,
  input: CreateContractFromQuoteInput = {}
): Promise<CreateContractFromQuoteOutcome> {
  checkSalesBlocked(organizationId);
  const quote = await getQuoteForContract(quoteId, organizationId);
  if (!quote) {
    return { kind: 'quote_not_found' };
  }
  if (!isQuoteApproved(quote.status)) {
    return { kind: 'quote_not_accepted', status: quote.status };
  }

  const projectId = quote.project_id;
  if (!projectId) {
    return { kind: 'quote_project_required' };
  }

  const totalRaw = quote.total_vnd;
  if (totalRaw === null || !Number.isFinite(totalRaw) || totalRaw < 0) {
    return { kind: 'quote_price_total_required' };
  }
  const totalVnd = Math.round(totalRaw);

  const depositPercentage = input.deposit_percentage ?? DEFAULT_DEPOSIT_PERCENTAGE;
  const depositVnd = Math.round((totalVnd * depositPercentage) / 100);
  const finalPaymentVnd = totalVnd - depositVnd;
  const warrantyYears = input.warranty_years ?? DEFAULT_WARRANTY_YEARS;

  const customer_snapshot: Record<string, unknown> = {
    name: quote.customer_name ?? undefined,
    phone: quote.customer_phone ?? undefined,
    email: quote.customer_email ?? undefined,
    address: undefined,
  };
  const system_snapshot: Record<string, unknown> = {};
  const financial_snapshot: Record<string, unknown> = {
    ...(quote.financial_snapshot ?? {}),
    price_total: totalVnd,
    deposit_percentage: depositPercentage,
    deposit_vnd: depositVnd,
    final_payment_vnd: finalPaymentVnd,
    total_vnd: totalVnd,
    warranty_years: warrantyYears,
    ...(input.expected_start_date && {
      expected_start_date: input.expected_start_date.toISOString().slice(0, 10),
    }),
    ...(input.expected_completion_date && {
      expected_completion_date: input.expected_completion_date.toISOString().slice(0, 10),
    }),
  };

  const payment_terms = [
    { milestone: 'Deposit', pct: depositPercentage },
    { milestone: 'Final', pct: 100 - depositPercentage },
  ];

  const contract_number = generateContractNumber();

  const expectedStart = input.expected_start_date?.toISOString().slice(0, 10) ?? null;
  const expectedCompletion = input.expected_completion_date?.toISOString().slice(0, 10) ?? null;

  const result = await withOrgContext(organizationId, async (client) => {
    const insertResult = await client.query(
      `INSERT INTO contracts (
        organization_id, project_id, quote_id, contract_number, status,
        deposit_percentage, deposit_vnd, final_payment_vnd, total_vnd,
        expected_start_date, expected_completion_date, warranty_years
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, organization_id, project_id, quote_id, contract_number, status,
        deposit_percentage, deposit_vnd, final_payment_vnd, total_vnd,
        expected_start_date, expected_completion_date, warranty_years,
        created_at, updated_at`,
      [
        organizationId,
        projectId,
        quoteId,
        contract_number,
        CONTRACT_STATUS_DRAFT,
        depositPercentage,
        depositVnd,
        finalPaymentVnd,
        totalVnd,
        expectedStart,
        expectedCompletion,
        warrantyYears,
      ]
    );

    const row = insertResult.rows[0] as {
      id: string;
      organization_id: string;
      project_id: string;
      quote_id: string;
      contract_number: string;
      status: string;
      deposit_percentage: string | number;
      deposit_vnd: string | number;
      final_payment_vnd: string | number;
      total_vnd: string | number;
      expected_start_date: string | null;
      expected_completion_date: string | null;
      warranty_years: string | number;
      created_at: string;
      updated_at: string;
    };

    const contract: CreateContractFromQuoteResult = {
      id: row.id,
      organization_id: row.organization_id,
      project_id: row.project_id,
      quote_id: row.quote_id,
      contract_number: row.contract_number,
      status: row.status,
      contract_value: String(row.total_vnd ?? totalVnd),
      deposit_vnd: Number(row.deposit_vnd ?? depositVnd),
      final_payment_vnd: Number(row.final_payment_vnd ?? finalPaymentVnd),
      total_vnd: Number(row.total_vnd ?? totalVnd),
      deposit_percentage: Number(row.deposit_percentage ?? depositPercentage),
      warranty_years: Number(row.warranty_years ?? warrantyYears),
      customer_snapshot,
      system_snapshot,
      financial_snapshot,
      payment_terms,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    await auditLogWrite({
      organization_id: organizationId,
      actor: input.actor ?? 'system',
      action: 'contract.created.from_quote',
      entity_type: 'contract',
      entity_id: contract.id,
      metadata: {
        quote_id: quoteId,
        project_id: projectId,
        contract_id: contract.id,
        contract_number: contract.contract_number,
        status: contract.status,
        total_vnd: contract.total_vnd,
        deposit_vnd: contract.deposit_vnd,
        final_payment_vnd: contract.final_payment_vnd,
        warranty_years: contract.warranty_years,
      },
    });

    return { kind: 'ok' as const, contract };
  });

  return result;
}
