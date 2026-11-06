'use client';

import { useState, useMemo } from 'react';
import CalculatorLeadCapture from '@/app/components/CalculatorLeadCapture';
import { calculateInvestment, formatMoney } from '@/lib/calculators/investor-analysis';
import { marketRentDefault } from '@/lib/calculators/rent-estimate';

interface InvestorCalculatorProps {
  purchasePrice: number;
  maintenanceFee?: number;
  monthlyTaxes?: number;
  bedrooms?: number;
  neighborhood?: string;
  /** Open on first render (the section is collapsed by default; tests render it open). */
  defaultExpanded?: boolean;
  /** The listing's borough: a home's starting rent is the median asking rent of live rentals of its size there. */
  borough?: string;
  /** The rent a month entered for THIS listing (a commercial listing's rate per SF x its area): it replaces the borough's median. */
  defaultMonthlyRent?: number;
  /** Where that rent comes from, as it is told under the box. */
  rentBasis?: string;
}

export default function InvestorCalculator({
  purchasePrice,
  maintenanceFee = 0,
  monthlyTaxes = 0,
  bedrooms = 1,
  neighborhood: _neighborhood = '',
  defaultExpanded = false,
  borough,
  defaultMonthlyRent,
  rentBasis,
}: InvestorCalculatorProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [downPaymentPercent, setDownPaymentPercent] = useState(25);
  const [interestRate, setInterestRate] = useState(7.0);
  // The rent starts from the listing's own (a commercial listing's, entered by the broker) or, for a home, the median asking rent of live rentals of its size in its borough (lib/calculators/rent-estimate.ts)
  const market = marketRentDefault(bedrooms, borough);
  const ownRent = defaultMonthlyRent && defaultMonthlyRent > 0 ? defaultMonthlyRent : 0;
  const rentBasisText = ownRent ? (rentBasis || 'The rent entered for this listing') : market.basis;
  const [estimatedRent, setEstimatedRent] = useState(ownRent || market.monthly);
  const [vacancyRate, setVacancyRate] = useState(5);
  const [annualAppreciation, setAnnualAppreciation] = useState(3);
  const [holdingPeriod, setHoldingPeriod] = useState(5);

  // The maths lives in lib/calculators/investor-analysis.ts (tested against the printed page of 333 E 46th St #2G; a cleared or mistyped box cannot make it NaN)
  const calculations = useMemo(() => calculateInvestment({
    purchasePrice, maintenanceFee, monthlyTaxes, estimatedRent, downPaymentPercent, interestRate, vacancyRate, annualAppreciation, holdingPeriod,
  }), [purchasePrice, downPaymentPercent, interestRate, estimatedRent, vacancyRate,
      maintenanceFee, monthlyTaxes, annualAppreciation, holdingPeriod]);

  const isPositiveCashFlow = calculations.monthlyCashFlow > 0;

  return (
    <div className="glass-card rounded-3xl overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="font-display font-semibold text-brand-dark">Investment Analysis</h3>
            <p className="text-sm text-brand-dark/85">ROI, Cash on Cash, Cap Rate</p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-brand-dark/90 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-6 pb-6 border-t border-black/5">
          {/* Key Metrics Summary */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-gray-50/50 rounded-2xl p-3 text-center">
              <p className="text-xs text-brand-dark/85 mb-1">Cap Rate</p>
              <p className="text-xl font-display font-bold text-brand-dark">{calculations.capRate.toFixed(2)}%</p>
            </div>
            <div className="bg-gray-50/50 rounded-2xl p-3 text-center">
              <p className="text-xs text-brand-dark/85 mb-1">Cash on Cash</p>
              <p className={`text-xl font-display font-bold ${calculations.cashOnCash >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {calculations.cashOnCash.toFixed(2)}%
              </p>
            </div>
            <div className="bg-gray-50/50 rounded-2xl p-3 text-center">
              <p className="text-xs text-brand-dark/85 mb-1">Monthly Cash Flow</p>
              <p className={`text-xl font-display font-bold ${isPositiveCashFlow ? 'text-green-600' : 'text-red-600'}`}>
                {formatMoney(calculations.monthlyCashFlow)}
              </p>
            </div>
            <div className="bg-gray-50/50 rounded-2xl p-3 text-center">
              <p className="text-xs text-brand-dark/85 mb-1">Total ROI (Yr 1)</p>
              <p className={`text-xl font-display font-bold ${calculations.totalROI >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {calculations.totalROI.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* No verdict on the cash flow: the figures are information (Maya, 2026-11-05: "this is informational"), so there is no banner either way */}
          {/* Inputs */}
          <div className="mt-6 space-y-4">
            <h4 className="font-display font-medium text-brand-dark text-sm">Investment Parameters</h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-brand-dark/85 mb-1">Est. Monthly Rent</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark/90">$</span>
                  <input
                    type="number"
                    value={estimatedRent}
                    onChange={(e) => setEstimatedRent(Number(e.target.value))}
                    className="w-full pl-7 pr-3 py-2 rounded-2xl bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                  />
                </div>
                <p className="mt-1 text-[11px] leading-snug text-brand-dark/70">{rentBasisText}. Change it to your own estimate.</p>
              </div>
              <div>
                <label className="block text-xs text-brand-dark/85 mb-1">Down Payment</label>
                <div className="relative">
                  <input
                    type="number"
                    value={downPaymentPercent}
                    onChange={(e) => setDownPaymentPercent(Number(e.target.value))}
                    className="w-full pl-3 pr-7 py-2 rounded-2xl bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                    min={10}
                    max={100}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-dark/90">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-brand-dark/85 mb-1">Interest Rate</label>
                <div className="relative">
                  <input
                    type="number"
                    value={interestRate}
                    onChange={(e) => setInterestRate(Number(e.target.value))}
                    className="w-full pl-3 pr-7 py-2 rounded-2xl bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                    step={0.125}
                    min={3}
                    max={12}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-dark/90">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-brand-dark/85 mb-1">Vacancy Rate</label>
                <div className="relative">
                  <input
                    type="number"
                    value={vacancyRate}
                    onChange={(e) => setVacancyRate(Number(e.target.value))}
                    className="w-full pl-3 pr-7 py-2 rounded-2xl bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                    min={0}
                    max={20}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-dark/90">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-brand-dark/85 mb-1">Annual Appreciation</label>
                <div className="relative">
                  <input
                    type="number"
                    value={annualAppreciation}
                    onChange={(e) => setAnnualAppreciation(Number(e.target.value))}
                    className="w-full pl-3 pr-7 py-2 rounded-2xl bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                    step={0.5}
                    min={-5}
                    max={10}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-dark/90">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-brand-dark/85 mb-1">Holding Period</label>
                <div className="relative">
                  <input
                    type="number"
                    value={holdingPeriod}
                    onChange={(e) => setHoldingPeriod(Number(e.target.value))}
                    className="w-full pl-3 pr-8 py-2 rounded-2xl bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                    min={1}
                    max={30}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-dark/90 text-xs">yrs</span>
                </div>
              </div>
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="mt-6 pt-4 border-t border-black/5">
            <h4 className="font-display font-medium text-brand-dark text-sm mb-3">Monthly Breakdown</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-brand-dark/85">Effective Rent (after vacancy)</span>
                <span className="text-green-600">+{formatMoney(calculations.effectiveMonthlyRent)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-dark/85">Mortgage (P&I)</span>
                <span className="text-red-600">{formatMoney(-calculations.monthlyMortgage)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-dark/85">Maint/CC, taxes &amp; insurance</span>
                <span className="text-red-600">{formatMoney(-calculations.monthlyExpenses)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-black/5 font-medium">
                <span className="text-brand-dark/95">Monthly Cash Flow</span>
                <span className={isPositiveCashFlow ? 'text-green-600' : 'text-red-600'}>
                  {formatMoney(calculations.monthlyCashFlow)}
                </span>
              </div>
            </div>
          </div>

          {/* Projection */}
          <div className="mt-6 pt-4 border-t border-black/5">
            <h4 className="font-display font-medium text-brand-dark text-sm mb-3">{calculations.years}-Year Projection</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-brand-dark/85">Total Cash Invested</span>
                <span className="font-medium">{formatMoney(calculations.totalCashInvested)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-dark/85">Cumulative Cash Flow</span>
                <span className={calculations.cumulativeCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatMoney(calculations.cumulativeCashFlow)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-dark/85">Equity Built (principal paydown)</span>
                <span className="text-green-600">{formatMoney(calculations.totalEquityBuilt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-dark/85">Appreciation Gain</span>
                <span className={calculations.totalAppreciation >= 0 ? 'text-green-600' : 'text-red-600'}>{formatMoney(calculations.totalAppreciation)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-dark/85">Future Property Value</span>
                <span className="font-medium">{formatMoney(calculations.futureValue)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-black/5 font-medium">
                <span className="text-brand-dark/95">Total Profit (after sale)</span>
                <span className={calculations.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatMoney(calculations.totalProfit)}
                </span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-brand-dark/95">Annualized Return</span>
                {calculations.annualizedReturn === null ? (
                  <span className="text-brand-dark/70">&mdash;</span>
                ) : (
                  <span className={calculations.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {calculations.annualizedReturn.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="mt-6 pt-4 border-t border-black/5">
            <h4 className="font-display font-medium text-brand-dark text-sm mb-3">Additional Metrics</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-brand-dark/85">NOI (Annual)</span>
                <span className="font-medium">{formatMoney(calculations.noi)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-dark/85">GRM</span>
                <span className="font-medium">{calculations.grm === null ? '—' : `${calculations.grm.toFixed(1)}x`}</span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-brand-dark/90">
            *Estimates only. Assumes 4% closing costs, 6% selling costs, a 30-year loan, 3% annual rent growth, 2% expense growth, insurance of $500 a year. The maintenance is the only other expense (taxes are added when the listing has them separately). The starting rent is an estimate based on average rents.
            Consult a financial advisor and tax professional for investment decisions.
          </p>

          <CalculatorLeadCapture
            calculatorType="investor"
            hasCalculated={isExpanded}
            resultsSummary={`Price: ${formatMoney(purchasePrice)}. Cap rate: ${calculations.capRate.toFixed(2)}%. Cash on cash: ${calculations.cashOnCash.toFixed(2)}%. Monthly cash flow: ${formatMoney(calculations.monthlyCashFlow)}.`}
          />
        </div>
      )}
    </div>
  );
}
