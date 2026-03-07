'use client';

import { useState, useMemo } from 'react';

interface MortgageCalculatorProps {
  purchasePrice: number;
  maintenanceFee?: number;
  monthlyTaxes?: number;
}

export default function MortgageCalculator({
  purchasePrice,
  maintenanceFee = 0,
  monthlyTaxes = 0,
}: MortgageCalculatorProps) {
  const [downPaymentPercent, setDownPaymentPercent] = useState(20);
  const [interestRate, setInterestRate] = useState(6.5);
  const [loanTerm, setLoanTerm] = useState(30);

  const calculations = useMemo(() => {
    const downPayment = purchasePrice * (downPaymentPercent / 100);
    const loanAmount = purchasePrice - downPayment;
    const monthlyRate = interestRate / 100 / 12;
    const totalPayments = loanTerm * 12;

    // Monthly mortgage payment (P&I)
    let monthlyPrincipalInterest = 0;
    if (monthlyRate > 0) {
      monthlyPrincipalInterest = loanAmount *
        (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) /
        (Math.pow(1 + monthlyRate, totalPayments) - 1);
    } else {
      monthlyPrincipalInterest = loanAmount / totalPayments;
    }

    // Estimated homeowner's insurance (0.5% of purchase price annually)
    const monthlyInsurance = Math.round((purchasePrice * 0.005) / 12);

    // Total monthly payment
    const totalMonthly = monthlyPrincipalInterest + maintenanceFee + monthlyTaxes + monthlyInsurance;

    // Total interest paid over loan term
    const totalPaid = monthlyPrincipalInterest * totalPayments;
    const totalInterest = totalPaid - loanAmount;

    return {
      downPayment: Math.round(downPayment),
      loanAmount: Math.round(loanAmount),
      monthlyPrincipalInterest: Math.round(monthlyPrincipalInterest),
      monthlyTaxes: Math.round(monthlyTaxes),
      maintenanceFee: Math.round(maintenanceFee),
      monthlyInsurance,
      totalMonthly: Math.round(totalMonthly),
      totalInterest: Math.round(totalInterest),
      totalPaid: Math.round(totalPaid + downPayment),
    };
  }, [purchasePrice, downPaymentPercent, interestRate, loanTerm, maintenanceFee, monthlyTaxes]);

  // Calculate pie chart percentages
  const pieData = useMemo(() => {
    const total = calculations.totalMonthly;
    return {
      principalInterest: (calculations.monthlyPrincipalInterest / total) * 100,
      taxes: (calculations.monthlyTaxes / total) * 100,
      maintenance: (calculations.maintenanceFee / total) * 100,
      insurance: (calculations.monthlyInsurance / total) * 100,
    };
  }, [calculations]);

  return (
    <div className="glass-card rounded-3xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h3 className="font-display font-semibold text-brand-dark">Mortgage Calculator</h3>
          <p className="text-sm text-brand-dark/85">Estimate your monthly payment</p>
        </div>
      </div>

      {/* Total Monthly Payment */}
      <div className="bg-brand-gold/5 rounded-2xl p-4 mb-6 text-center">
        <p className="text-sm text-brand-dark/90 mb-1">Estimated Monthly Payment</p>
        <p className="text-2xl font-display font-bold text-brand-dark">
          ${calculations.totalMonthly.toLocaleString()}
        </p>
      </div>

      {/* Payment Breakdown Visual */}
      <div className="mb-6">
        <div className="h-4 rounded-full overflow-hidden flex">
          <div
            className="bg-brand-gold"
            style={{ width: `${pieData.principalInterest}%` }}
            title="Principal & Interest"
          />
          <div
            className="bg-blue-500"
            style={{ width: `${pieData.taxes}%` }}
            title="Property Taxes"
          />
          <div
            className="bg-green-500"
            style={{ width: `${pieData.maintenance}%` }}
            title="Maintenance/HOA"
          />
          <div
            className="bg-purple-500"
            style={{ width: `${pieData.insurance}%` }}
            title="Insurance"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-brand-gold"></span>
            <span className="text-brand-dark/90">P&I: ${calculations.monthlyPrincipalInterest.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            <span className="text-brand-dark/90">Taxes: ${calculations.monthlyTaxes.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            <span className="text-brand-dark/90">Maint: ${calculations.maintenanceFee.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-purple-500"></span>
            <span className="text-brand-dark/90">Ins: ${calculations.monthlyInsurance.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <label className="text-brand-dark/90">Down Payment</label>
            <span className="font-medium">{downPaymentPercent}% (${calculations.downPayment.toLocaleString()})</span>
          </div>
          <input
            type="range"
            value={downPaymentPercent}
            onChange={(e) => setDownPaymentPercent(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-gold"
            min={5}
            max={50}
            step={5}
          />
          <div className="flex justify-between text-xs text-brand-dark/90 mt-1">
            <span>5%</span>
            <span>50%</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <label className="text-brand-dark/90">Interest Rate</label>
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
          <div className="flex justify-between text-xs text-brand-dark/90 mt-1">
            <span>3%</span>
            <span>10%</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <label className="text-brand-dark/90">Loan Term</label>
            <span className="font-medium">{loanTerm} years</span>
          </div>
          <div className="flex gap-2">
            {[15, 20, 30].map((term) => (
              <button
                key={term}
                onClick={() => setLoanTerm(term)}
                className={`flex-1 py-2 text-sm rounded-2xl transition-colors ${
                  loanTerm === term
                    ? 'bg-brand-gold text-white'
                    : 'bg-white/60 text-brand-dark/90 ring-1 ring-black/5 hover:bg-white/80'
                }`}
              >
                {term} yr
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loan Details */}
      <div className="mt-6 pt-4 border-t border-black/5 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-brand-dark/85">Purchase Price</span>
          <span className="font-medium">${purchasePrice.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-dark/85">Loan Amount</span>
          <span className="font-medium">${calculations.loanAmount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-dark/85">Total Interest ({loanTerm} yrs)</span>
          <span className="text-brand-dark/90">${calculations.totalInterest.toLocaleString()}</span>
        </div>
      </div>

      <p className="mt-4 text-xs text-brand-dark/90">
        *Estimate only. Actual payments may vary. Does not include PMI if down payment is less than 20%.
      </p>
    </div>
  );
}
