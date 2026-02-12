'use client';

import { useState } from 'react';
import HeroSection from '@/components/landing/HeroSection';
import CalculatorSection from '@/components/landing/CalculatorSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import CTASection from '@/components/landing/CTASection';
import PreviewReportSection from '@/components/landing/PreviewReportSection';

interface AnalysisResult {
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

export default function LandingPage() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [billVnd, setBillVnd] = useState(0);
  const [verified, setVerified] = useState(false);

  const handleResult = (result: AnalysisResult, bill: number) => {
    setAnalysisResult(result);
    setBillVnd(bill);
  };

  const handleVerified = () => {
    setVerified(true);
  };

  return (
    <>
      {/* Stage A: Hero Hook */}
      <HeroSection />

      {/* Stage B + C: Lite Input + Lite Report */}
      <CalculatorSection onResult={handleResult} />

      {/* Benefits */}
      <FeaturesSection />

      {/* Stage D + E: CTA + Phone Gate */}
      <CTASection onVerified={handleVerified} />

      {/* Stage F: Preview Report (shown after OTP verification) */}
      {analysisResult && (
        <PreviewReportSection
          result={analysisResult}
          billVnd={billVnd}
          visible={verified}
        />
      )}
    </>
  );
}
