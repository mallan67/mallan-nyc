'use client';

import { useState, useMemo } from 'react';

interface InvestorCalculatorProps {
  purchasePrice: number;
  maintenanceFee?: number;
  monthlyTaxes?: number;
  bedrooms?: number;
  neighborhood?: string;
}

export default function InvestorCalculator({
  purchasePrice,
  maintenanceFee = 0,
  monthlyTaxes = 0,
  bedrooms = 1,
  neighborhood: _neighborhood = '',
}: InvestorCalculatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [downPaymentPercent, setDownPaymentPercent] = useState(25);
  const [interestRate, setInterestRate] = useState(7.0);
  const [estimatedRent, setEstimatedRent] = useState(() => {
    // NYC average rents by bedroom (rough estimates)
    const rentEstimates: { [key: number]: number } = {
      0: 2500,  // Studio
      1: 3200,  // 1BR
      2: 4500,  // 2BR
      3: 6000,  // 3BR
      4: 8000,  // 4BR+
    };
    return rentEstimates[Math.min(bedrooms, 4)] || 3500;
  });
  const [vacancyRate, setVacancyRate] = useState(5);
  const [annualAppreciation, setAnnualAppreciation] = useState(3);
  const [holdingPeriod, setHoldingPeriod] = useState(5);

  const calculations = useMemo(() => {
    // Initial Investment
    const downPayment = purchasePrice * (downPaymentPercent / 100);
    const closingCosts = purchasePrice * 0.04; // 4% closing costs in NYC
    const totalCashInvested = downPayment + closingCosts;

    // Loan calculations
    const loanAmount = purchasePrice - downPayment;
    const monthlyRate = interestRate / 100 / 12;
    const totalPayments = 30 * 12;
    let monthlyMortgage = 0;
    if (monthlyRate > 0 && loanAmount > 0) {
      monthlyMortgage = loanAmount *
        (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) /
        (Math.pow(1 + monthlyRate, totalPayments) - 1);
    }

    // Monthly operating expenses
    const monthlyInsurance = Math.round((purchasePrice * 0.004) / 12);
    const monthlyRepairs = Math.round(estimatedRent * 0.05); // 5% for repairs/maintenance reserve
    const monthlyExpenses = maintenanceFee + monthlyTaxes + monthlyInsurance + monthlyRepairs;

    // Income calculations
    const grossMonthlyRent = estimatedRent;
    const effectiveMonthlyRent = grossMonthlyRent * (1 - vacancyRate / 100);
    const annualGrossRent = grossMonthlyRent * 12;
    const annualEffectiveRent = effectiveMonthlyRent * 12;

    // Annual operating expenses (excluding mortgage)
    const annualOperatingExpenses = monthlyExpenses * 12;

    // Net Operating Income (NOI) - before debt service
    const noi = annualEffectiveRent - annualOperatingExpenses;

    // Cap Rate
    const capRate = (noi / purchasePrice) * 100;

    // Cash Flow (after debt service)
    const annualDebtService = monthlyMortgage * 12;
    const annualCashFlow = noi - annualDebtService;
    const monthlyCashFlow = annualCashFlow / 12;

    // Cash on Cash Return
    const cashOnCash = (annualCashFlow / totalCashInvested) * 100;

    // Gross Rent Multiplier
    const grm = purchasePrice / annualGrossRent;

    // Equity buildup (first year)
    let equityFirstYear = 0;
    let balance = loanAmount;
    for (let month = 1; month <= 12; month++) {
      const interestPayment = balance * monthlyRate;
      const principalPayment = monthlyMortgage - interestPayment;
      balance -= principalPayment;
      equityFirstYear += principalPayment;
    }

    // Total ROI components (first year)
    const appreciationFirstYear = purchasePrice * (annualAppreciation / 100);
    const totalReturnFirstYear = annualCashFlow + equityFirstYear + appreciationFirstYear;
    const totalROI = (totalReturnFirstYear / totalCashInvested) * 100;

    // Projections over holding period
    let cumulativeCashFlow = 0;
    let totalEquityBuilt = 0;
    balance = loanAmount;
    for (let year = 1; year <= holdingPeriod; year++) {
      // Rent increases 3% annually
      const yearRent = effectiveMonthlyRent * Math.pow(1.03, year - 1) * 12;
      const yearExpenses = annualOperatingExpenses * Math.pow(1.02, year - 1); // 2% expense growth
      const yearNOI = yearRent - yearExpenses;
      cumulativeCashFlow += yearNOI - annualDebtService;

      // Equity buildup for the year
      for (let month = 1; month <= 12; month++) {
        const interestPayment = balance * monthlyRate;
        const principalPayment = monthlyMortgage - interestPayment;
        balance -= principalPayment;
        totalEquityBuilt += principalPayment;
      }
    }

    // Future value of property
    const futureValue = purchasePrice * Math.pow(1 + annualAppreciation / 100, holdingPeriod);
    const totalAppreciation = futureValue - purchasePrice;

    // Exit calculations
    const sellingCosts = futureValue * 0.06; // 6% selling costs
    const netSaleProceeds = futureValue - balance - sellingCosts;
    const totalProfit = netSaleProceeds + cumulativeCashFlow - totalCashInvested;
    const annualizedReturn = (Math.pow((totalCashInvested + totalProfit) / totalCashInvested, 1 / holdingPeriod) - 1) * 100;

    return {
      // Initial
      downPayment: Math.round(downPayment),
      closingCosts: Math.round(closingCosts),
      totalCashInvested: Math.round(totalCashInvested),
      loanAmount: Math.round(loanAmount),

      // Monthly
      monthlyMortgage: Math.round(monthlyMortgage),
      monthlyExpenses: Math.round(monthlyExpenses),
      monthlyCashFlow: Math.round(monthlyCashFlow),
      effectiveMonthlyRent: Math.round(effectiveMonthlyRent),

      // Annual
      noi: Math.round(noi),
      annualCashFlow: Math.round(annualCashFlow),

      // Returns
      capRate: capRate.toFixed(2),
      cashOnCash: cashOnCash.toFixed(2),
      totalROI: totalROI.toFixed(2),
      grm: grm.toFixed(1),

      // Projections
      futureValue: Math.round(futureValue),
      totalAppreciation: Math.round(totalAppreciation),
      totalEquityBuilt: Math.round(totalEquityBuilt),
      cumulativeCashFlow: Math.round(cumulativeCashFlow),
      totalProfit: Math.round(totalProfit),
      annualizedReturn: annualizedReturn.toFixed(2),
    };
  }, [purchasePrice, downPaymentPercent, interestRate, estimatedRent, vacancyRate,
      maintenanceFee, monthlyTaxes, annualAppreciation, holdingPeriod]);

  const isPositiveCashFlow = calculations.monthlyCashFlow > 0;

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">Investment Analysis</h3>
            <p className="text-sm text-gray-500">ROI, Cash on Cash, Cap Rate</p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-6 pb-6 border-t">
          {/* Key Metrics Summary */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Cap Rate</p>
              <p className="text-xl font-bold text-gray-900">{calculations.capRate}%</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Cash on Cash</p>
              <p className={`text-xl font-bold ${Number(calculations.cashOnCash) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {calculations.cashOnCash}%
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Monthly Cash Flow</p>
              <p className={`text-xl font-bold ${isPositiveCashFlow ? 'text-green-600' : 'text-red-600'}`}>
                ${calculations.monthlyCashFlow.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Total ROI (Yr 1)</p>
              <p className={`text-xl font-bold ${Number(calculations.totalROI) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {calculations.totalROI}%
              </p>
            </div>
          </div>

          {/* Cash Flow Status */}
          <div className={`mt-4 p-3 rounded-lg ${isPositiveCashFlow ? 'bg-green-50' : 'bg-amber-50'}`}>
            <div className="flex items-center gap-2">
              {isPositiveCashFlow ? (
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              <span className={`text-sm font-medium ${isPositiveCashFlow ? 'text-green-700' : 'text-amber-700'}`}>
                {isPositiveCashFlow
                  ? 'Positive cash flow property'
                  : 'Negative cash flow - relies on appreciation'}
              </span>
            </div>
          </div>

          {/* Inputs */}
          <div className="mt-6 space-y-4">
            <h4 className="font-medium text-gray-900 text-sm">Investment Parameters</h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Est. Monthly Rent</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    value={estimatedRent}
                    onChange={(e) => setEstimatedRent(Number(e.target.value))}
                    className="w-full pl-7 pr-3 py-2 border rounded text-sm focus:ring-1 focus:ring-brand-gold focus:border-brand-gold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Down Payment</label>
                <div className="relative">
                  <input
                    type="number"
                    value={downPaymentPercent}
                    onChange={(e) => setDownPaymentPercent(Number(e.target.value))}
                    className="w-full pl-3 pr-7 py-2 border rounded text-sm focus:ring-1 focus:ring-brand-gold focus:border-brand-gold"
                    min={10}
                    max={100}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Interest Rate</label>
                <div className="relative">
                  <input
                    type="number"
                    value={interestRate}
                    onChange={(e) => setInterestRate(Number(e.target.value))}
                    className="w-full pl-3 pr-7 py-2 border rounded text-sm focus:ring-1 focus:ring-brand-gold focus:border-brand-gold"
                    step={0.125}
                    min={3}
                    max={12}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Vacancy Rate</label>
                <div className="relative">
                  <input
                    type="number"
                    value={vacancyRate}
                    onChange={(e) => setVacancyRate(Number(e.target.value))}
                    className="w-full pl-3 pr-7 py-2 border rounded text-sm focus:ring-1 focus:ring-brand-gold focus:border-brand-gold"
                    min={0}
                    max={20}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Annual Appreciation</label>
                <div className="relative">
                  <input
                    type="number"
                    value={annualAppreciation}
                    onChange={(e) => setAnnualAppreciation(Number(e.target.value))}
                    className="w-full pl-3 pr-7 py-2 border rounded text-sm focus:ring-1 focus:ring-brand-gold focus:border-brand-gold"
                    step={0.5}
                    min={-5}
                    max={10}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Holding Period</label>
                <div className="relative">
                  <input
                    type="number"
                    value={holdingPeriod}
                    onChange={(e) => setHoldingPeriod(Number(e.target.value))}
                    className="w-full pl-3 pr-8 py-2 border rounded text-sm focus:ring-1 focus:ring-brand-gold focus:border-brand-gold"
                    min={1}
                    max={30}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">yrs</span>
                </div>
              </div>
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="mt-6 pt-4 border-t">
            <h4 className="font-medium text-gray-900 text-sm mb-3">Monthly Breakdown</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Effective Rent (after vacancy)</span>
                <span className="text-green-600">+${calculations.effectiveMonthlyRent.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Mortgage (P&I)</span>
                <span className="text-red-600">-${calculations.monthlyMortgage.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Taxes + Maint + Insurance</span>
                <span className="text-red-600">-${calculations.monthlyExpenses.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t font-medium">
                <span className="text-gray-700">Monthly Cash Flow</span>
                <span className={isPositiveCashFlow ? 'text-green-600' : 'text-red-600'}>
                  ${calculations.monthlyCashFlow.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Projection */}
          <div className="mt-6 pt-4 border-t">
            <h4 className="font-medium text-gray-900 text-sm mb-3">{holdingPeriod}-Year Projection</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Cash Invested</span>
                <span className="font-medium">${calculations.totalCashInvested.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cumulative Cash Flow</span>
                <span className={calculations.cumulativeCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}>
                  ${calculations.cumulativeCashFlow.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Equity Built (principal paydown)</span>
                <span className="text-green-600">${calculations.totalEquityBuilt.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Appreciation Gain</span>
                <span className="text-green-600">${calculations.totalAppreciation.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Future Property Value</span>
                <span className="font-medium">${calculations.futureValue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t font-medium">
                <span className="text-gray-700">Total Profit (after sale)</span>
                <span className={calculations.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                  ${calculations.totalProfit.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-gray-700">Annualized Return</span>
                <span className={Number(calculations.annualizedReturn) >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {calculations.annualizedReturn}%
                </span>
              </div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="mt-6 pt-4 border-t">
            <h4 className="font-medium text-gray-900 text-sm mb-3">Additional Metrics</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">NOI (Annual)</span>
                <span className="font-medium">${calculations.noi.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">GRM</span>
                <span className="font-medium">{calculations.grm}x</span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            *Estimates only. Assumes 4% closing costs, 6% selling costs, 3% annual rent growth, 2% expense growth.
            Consult a financial advisor and tax professional for investment decisions.
          </p>
        </div>
      )}
    </div>
  );
}
