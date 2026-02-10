export interface LiteAnalysisInput {
  monthly_bill_vnd: number;
  region: 'NORTH' | 'SOUTH' | 'CENTRAL';
}

export interface LiteAnalysisOutput {
  suggested_kwp: number;
  est_kwh_month: number;
  est_saving_vnd_month: number;
  disclaimer: string;
}

const AVG_PRICE_VND_PER_KWH = 2500;
const SUNSHINE_HOURS_PER_DAY: Record<string, number> = {
  NORTH: 3.5,
  SOUTH: 4.8,
  CENTRAL: 4.0,
};
const SYSTEM_EFFICIENCY = 0.8;

export function calculateLiteAnalysis(input: LiteAnalysisInput): LiteAnalysisOutput {
  if (input.monthly_bill_vnd <= 0) {
    throw new Error('monthly_bill_vnd must be positive');
  }
  if (!['NORTH', 'SOUTH', 'CENTRAL'].includes(input.region)) {
    throw new Error('region must be NORTH, SOUTH, or CENTRAL');
  }

  const monthly_kwh = input.monthly_bill_vnd / AVG_PRICE_VND_PER_KWH;
  const daily_kwh = monthly_kwh / 30;
  const sunshine_hours = SUNSHINE_HOURS_PER_DAY[input.region];
  const raw_kwp = daily_kwh / (sunshine_hours * SYSTEM_EFFICIENCY);

  let suggested_kwp = Math.round(raw_kwp * 2) / 2;
  suggested_kwp = Math.max(1, Math.min(20, suggested_kwp));

  const est_kwh_month = suggested_kwp * sunshine_hours * SYSTEM_EFFICIENCY * 30;
  const est_saving_vnd_month = Math.round(est_kwh_month * 0.8 * AVG_PRICE_VND_PER_KWH);

  return {
    suggested_kwp,
    est_kwh_month: Math.round(est_kwh_month),
    est_saving_vnd_month,
    disclaimer: 'Đây là ước tính sơ bộ. Cần khảo sát thực tế để có báo giá chính xác.',
  };
}
