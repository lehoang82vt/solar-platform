export type LaborCostType = 'FIXED' | 'PER_KWP' | 'MANUAL';

export interface LaborCalculationInput {
  labor_cost_type: LaborCostType;
  labor_cost_fixed_vnd?: number;
  labor_cost_per_kwp_vnd?: number;
  labor_cost_manual_vnd?: number;
  system_size_kwp?: number;
}

/**
 * Calculate labor cost based on type
 */
export function calculateLaborCost(input: LaborCalculationInput): number {
  switch (input.labor_cost_type) {
    case 'FIXED':
      if (!input.labor_cost_fixed_vnd) {
        throw new Error('Fixed labor cost required');
      }
      return input.labor_cost_fixed_vnd;

    case 'PER_KWP':
      if (!input.labor_cost_per_kwp_vnd || !input.system_size_kwp) {
        throw new Error('Per kWp labor cost and system size required');
      }
      return input.labor_cost_per_kwp_vnd * input.system_size_kwp;

    case 'MANUAL':
      if (!input.labor_cost_manual_vnd) {
        throw new Error('Manual labor cost required');
      }
      return input.labor_cost_manual_vnd;

    default:
      throw new Error(`Unknown labor cost type: ${input.labor_cost_type}`);
  }
}
