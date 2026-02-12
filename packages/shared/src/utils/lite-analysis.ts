export interface LiteAnalysisInput {
  monthly_bill_vnd: number;
  region: 'NORTH' | 'SOUTH' | 'CENTRAL';
}

export interface LiteAnalysisOutput {
  suggested_kwp: number;
  est_kwh_month: number;
  est_saving_vnd_month: number;
  est_kwh_year: number;
  est_saving_vnd_year: number;
  est_system_cost: number;
  est_payback_years: number;
  monthly_bill_after: number;
  disclaimer: string;
}

const AVG_PRICE_VND_PER_KWH = 2500;
const SUNSHINE_HOURS_PER_DAY: Record<string, number> = {
  NORTH: 3.5,
  SOUTH: 4.8,
  CENTRAL: 4.0,
};
const SYSTEM_EFFICIENCY = 0.8;
const COST_PER_KWP = 15_000_000; // VND per kWp installed

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
  const est_kwh_year = Math.round(est_kwh_month * 12);
  const est_saving_vnd_year = est_saving_vnd_month * 12;
  const est_system_cost = Math.round(suggested_kwp * COST_PER_KWP);
  const est_payback_years = est_saving_vnd_year > 0 ? Math.round((est_system_cost / est_saving_vnd_year) * 10) / 10 : 0;
  const monthly_bill_after = Math.max(0, input.monthly_bill_vnd - est_saving_vnd_month);

  return {
    suggested_kwp,
    est_kwh_month: Math.round(est_kwh_month),
    est_saving_vnd_month,
    est_kwh_year,
    est_saving_vnd_year,
    est_system_cost,
    est_payback_years,
    monthly_bill_after,
    disclaimer: 'Đây là ước tính sơ bộ dựa trên dữ liệu trung bình. Kết quả thực tế sẽ chính xác hơn sau khi khảo sát mái nhà.',
  };
}
