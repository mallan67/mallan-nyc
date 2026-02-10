'use client';

import { useState, useMemo } from 'react';

export default function AffordabilityCalculator() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [annualIncome, setAnnualIncome] = useState(150000);
  const [monthlyDebt, setMonthlyDebt] = useState(500);
  const [downPayment, setDownPayment] = useState(100000);
  const [interestRate, setInterestRate] = useState(6.5);
  const [propertyType, setPropertyType] = useState<'coop' | 'condo'>('condo');

  const calculations = useMemo(() => {
    // DTI limits: co-op boards use ~25% front-end; condo uses 43% back-end (QM)
    const dtiLimit = propertyType === 'coop' ? 0.25 : 0.43;
    const monthlyIncome = annualIncome / 12;

    // Max housing payment allowed by DTI
    const maxHousing = monthlyIncome * dtiLimit - monthlyDebt;
    const safeMaxHousing = Math.max(maxHousing, 0);

    // Estimate taxes + insurance + maintenance as portion of payment
    // Co-op: maintenance ~40% of payment; Condo: taxes+charges ~30%
    const nonMortgageRatio = propertyType === 'coop' ? 0.40 : 0.30;
    const maxMortgagePayment = safeMaxHousing * (1 - nonMortgageRatio);

    // Max loan from payment, rate, 30yr term
    const monthlyRate = interestRate / 100 / 12;
    const n = 360; // 30 years
    let maxLoan = 0;
    if (monthlyRate > 0 && maxMortgagePayment > 0) {
      maxLoan = maxMortgagePayment *
        (Math.pow(1 + monthlyRate, n) - 1) /
        (monthlyRate * Math.pow(1 + monthlyRate, n));
    }

    const maxPrice = maxLoan + downPayment;
    const dtiPercent = monthlyIncome > 0
      ? ((safeMaxHousing + monthlyDebt) / monthlyIncome) * 100
      : 0;

    // Monthly breakdown at max price
    const estMortgage = Math.round(maxMortgagePayment);
    const estTaxesAndCharges = Math.round(safeMaxHousing - maxMortgagePayment);

    return {
      maxPrice: Math.round(Math.max(maxPrice, 0)),
      maxLoan: Math.round(Math.max(maxLoan, 0)),
      maxMonthlyHousing: Math.round(safeMaxHousing),
      estMortgage,
      estTaxesAndCharges,
      dtiPercent: Math.min(dtiPercent, 100).toFixed(1),
      dtiLimit: (dtiLimit * 100).toFixed(0),
    };
  }, [annualIncome, monthlyDebt, downPayment, interestRate, propertyType]);

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">What Can I Afford?</h3>
            <p className="text-sm text-gray-500">Estimate your max purchase price for NYC</p>
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
          {/* Result */}
          <div className="mt-4 bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Estimated Max Purchase Price</p>
            <p className="text-3xl font-bold text-gray-900">
              ${calculations.maxPrice.toLocaleString()}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              ${calculations.maxLoan.toLocaleString()} loan + ${downPayment.toLocaleString()} down
            </p>
          </div>

          {/* Monthly breakdown */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Monthly Housing</p>
              <p className="text-lg font-bold text-gray-900">${calculations.maxMonthlyHousing.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Est. Mortgage</p>
              <p className="text-lg font-bold text-gray-900">${calculations.estMortgage.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">DTI Ratio</p>
              <p className="text-lg font-bold text-gray-900">{calculations.dtiPercent}%</p>
              <p className="text-xs text-gray-400">of {calculations.dtiLimit}% max</p>
            </div>
          </div>

          {/* Property type toggle */}
          <div className="mt-6">
            <label className="block text-xs text-gray-500 mb-2">Property Type</label>
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setPropertyType('condo')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  propertyType === 'condo'
                    ? 'bg-brand-gold text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Condo (43% DTI)
              </button>
              <button
                onClick={() => setPropertyType('coop')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  propertyType === 'coop'
                    ? 'bg-brand-gold text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Co-op (25% DTI)
              </button>
            </div>
          </div>

          {/* Sliders */}
          <div className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-gray-600">Annual Household Income</label>
                <span className="font-medium">${annualIncome.toLocaleString()}</span>
              </div>
              <input
                type="range"
                value={annualIncome}
                onChange={(e) => setAnnualIncome(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                min={50000}
                max={500000}
                step={5000}
              />
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-gray-600">Monthly Debt Payments</label>
                <span className="font-medium">${monthlyDebt.toLocaleString()}</span>
              </div>
              <input
                type="range"
                value={monthlyDebt}
                onChange={(e) => setMonthlyDebt(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                min={0}
                max={5000}
                step={100}
              />
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-gray-600">Down Payment Savings</label>
                <span className="font-medium">${downPayment.toLocaleString()}</span>
              </div>
              <input
                type="range"
                value={downPayment}
                onChange={(e) => setDownPayment(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                min={0}
                max={2000000}
                step={10000}
              />
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-gray-600">Interest Rate</label>
                <span className="font-medium">{interestRate}%</span>
              </div>
              <input
                type="range"
                value={interestRate}
                onChange={(e) => setInterestRate(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                min={3}
                max={10}
                step={0.125}
              />
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            *Estimates only. Co-op uses 25% front-end DTI (conservative board standard).
            Condo uses 43% back-end DTI (qualified mortgage). Actual approval varies by
            lender and building. Consult a mortgage professional for personalized advice.
          </p>
        </div>
      )}
    </div>
  );
}
