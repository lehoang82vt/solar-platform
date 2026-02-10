import { withOrgContext } from '../config/database';
import { write as auditLogWrite } from './auditLog';

export interface FinancialConfig {
  id: string;
  organization_id: string;
  target_gross_margin: number;
  warning_gross_margin: number;
  block_gross_margin: number;
  target_net_margin: number;
  warning_net_margin: number;
  block_net_margin: number;
  marketing_cost_pct: number;
  warranty_cost_pct: number;
  overhead_cost_pct: number;
  labor_cost_type: 'FIXED' | 'PER_KWP' | 'MANUAL';
  labor_cost_fixed_vnd?: number;
  labor_cost_per_kwp_vnd?: number;
  created_at: string;
  updated_at: string;
}

export interface FinancialConfigInput {
  target_gross_margin?: number;
  warning_gross_margin?: number;
  block_gross_margin?: number;
  target_net_margin?: number;
  warning_net_margin?: number;
  block_net_margin?: number;
  marketing_cost_pct?: number;
  warranty_cost_pct?: number;
  overhead_cost_pct?: number;
  labor_cost_type?: 'FIXED' | 'PER_KWP' | 'MANUAL';
  labor_cost_fixed_vnd?: number;
  labor_cost_per_kwp_vnd?: number;
}

function rowToConfig(row: Record<string, unknown>): FinancialConfig {
  return {
    ...row,
    target_gross_margin: Number(row.target_gross_margin),
    warning_gross_margin: Number(row.warning_gross_margin),
    block_gross_margin: Number(row.block_gross_margin),
    target_net_margin: Number(row.target_net_margin),
    warning_net_margin: Number(row.warning_net_margin),
    block_net_margin: Number(row.block_net_margin),
    marketing_cost_pct: Number(row.marketing_cost_pct),
    warranty_cost_pct: Number(row.warranty_cost_pct),
    overhead_cost_pct: Number(row.overhead_cost_pct),
    labor_cost_type: (row.labor_cost_type as FinancialConfig['labor_cost_type']) ?? 'PER_KWP',
    labor_cost_fixed_vnd:
      row.labor_cost_fixed_vnd != null ? Number(row.labor_cost_fixed_vnd) : undefined,
    labor_cost_per_kwp_vnd:
      row.labor_cost_per_kwp_vnd != null ? Number(row.labor_cost_per_kwp_vnd) : undefined,
  } as FinancialConfig;
}

/**
 * Get financial config for organization. Creates default if not exists.
 */
export async function getFinancialConfig(
  organizationId: string
): Promise<FinancialConfig> {
  return await withOrgContext(organizationId, async (client) => {
    let result = await client.query(
      `SELECT * FROM financial_configs WHERE organization_id = $1`,
      [organizationId]
    );

    if (result.rows.length === 0) {
      result = await client.query(
        `INSERT INTO financial_configs (organization_id)
         VALUES ($1)
         RETURNING *`,
        [organizationId]
      );
    }

    return rowToConfig(result.rows[0] as Record<string, unknown>);
  });
}

export interface UpdateFinancialConfigOptions {
  /** Actor for audit log (AUD-01: config change logged). */
  actor?: string;
}

/**
 * Update financial config.
 * AUD-01: Logs config.change with before/after values.
 */
export async function updateFinancialConfig(
  organizationId: string,
  input: FinancialConfigInput,
  options?: UpdateFinancialConfigOptions
): Promise<FinancialConfig> {
  let beforeRow: Record<string, unknown> | null = null;
  const updated = await withOrgContext(organizationId, async (client) => {
    const before = await client.query(
      `SELECT * FROM financial_configs WHERE organization_id = $1`,
      [organizationId]
    );
    if (before.rows.length > 0) {
      beforeRow = before.rows[0] as Record<string, unknown>;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    const allowedKeys: (keyof FinancialConfigInput)[] = [
      'target_gross_margin',
      'warning_gross_margin',
      'block_gross_margin',
      'target_net_margin',
      'warning_net_margin',
      'block_net_margin',
      'marketing_cost_pct',
      'warranty_cost_pct',
      'overhead_cost_pct',
      'labor_cost_type',
      'labor_cost_fixed_vnd',
      'labor_cost_per_kwp_vnd',
    ];

    for (const key of allowedKeys) {
      const value = input[key];
      if (value !== undefined) {
        updates.push(`${key} = $${paramIdx++}`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      return await getFinancialConfig(organizationId);
    }

    updates.push('updated_at = NOW()');
    values.push(organizationId);

    const result = await client.query(
      `UPDATE financial_configs
       SET ${updates.join(', ')}
       WHERE organization_id = $${paramIdx}
       RETURNING *`,
      values
    );

    const afterRow = result.rows[0] as Record<string, unknown>;
    await auditLogWrite({
      organization_id: organizationId,
      actor: options?.actor ?? 'system',
      action: 'config.change',
      entity_type: 'financial_config',
      metadata: {
        before: beforeRow ?? {},
        after: afterRow,
      },
    });

    return rowToConfig(afterRow);
  });

  return updated;
}

/**
 * Validate financial config input.
 */
export function validateFinancialConfig(
  config: FinancialConfigInput
): string[] {
  const errors: string[] = [];

  if (
    config.target_gross_margin !== undefined &&
    config.target_gross_margin < 0
  ) {
    errors.push('Target gross margin must be non-negative');
  }

  if (
    config.warning_gross_margin !== undefined &&
    config.block_gross_margin !== undefined
  ) {
    if (config.warning_gross_margin < config.block_gross_margin) {
      errors.push('Warning gross margin must be >= block margin');
    }
  }

  if (config.labor_cost_type === 'FIXED') {
    if (
      config.labor_cost_fixed_vnd === undefined ||
      config.labor_cost_fixed_vnd === null
    ) {
      errors.push('Fixed labor cost required when type is FIXED');
    }
  }

  if (config.labor_cost_type === 'PER_KWP') {
    if (
      config.labor_cost_per_kwp_vnd === undefined ||
      config.labor_cost_per_kwp_vnd === null
    ) {
      errors.push('Per kWp labor cost required when type is PER_KWP');
    }
  }

  return errors;
}
