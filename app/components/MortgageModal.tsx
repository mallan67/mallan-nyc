'use client';

import { useState, useMemo, useEffect } from 'react';

interface MortgageModalProps {
  purchasePrice: number;
  maintenanceFee: number;
  monthlyTaxes: number;
  isOpen: boolean;
  onClose: () => void;
  propertyType?: string;
}

export default function MortgageModal({
  purchasePrice,
  maintenanceFee,
  monthlyTaxes,
  isOpen,
  onClose,
  propertyType = 'Condo',
}: MortgageModalProps) {
  const [downPaymentPercent, setDownPaymentPercent] = useState(20);
  const [interestRate, setInterestRate] = useState(6.5);
  const [loanTerm, setLoanTerm] = useState(30);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

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

    // PMI if down payment < 20%
    const pmiRate = downPaymentPercent < 20 ? 0.01 : 0;
    const monthlyPMI = (loanAmount * pmiRate) / 12;

    // Estimated homeowner's insurance (0.4% of purchase price annually)
    const monthlyInsurance = Math.round((purchasePrice * 0.004) / 12);

    // Total monthly payment
    const totalMonthly = monthlyPrincipalInterest + maintenanceFee + monthlyTaxes + monthlyInsurance + monthlyPMI;

    // Closing costs breakdown (NYC specific)
    const isCoop = propertyType === 'Co-op';
    const closingCosts = {
      // Buyer costs
      bankAttorneyFee: 1500,
      buyerAttorneyFee: 3500,
      titleInsurance: isCoop ? 0 : Math.round(purchasePrice * 0.004),
      titleSearch: isCoop ? 350 : 500,
      mortgageRecordingTax: isCoop ? 0 : Math.round(loanAmount * 0.0225), // 2.25% on loans over $500k in NYC
      deedRecordingFee: isCoop ? 0 : 250,
      mansionTax: purchasePrice >= 1000000 ? Math.round(purchasePrice * 0.01) : 0, // 1% over $1M
      appraisal: 750,
      creditReport: 50,
      bankFee: Math.round(loanAmount * 0.01), // ~1% origination
      miscFees: 500,
    };

    const totalClosingCosts = Object.values(closingCosts).reduce((a, b) => a + b, 0);
    const totalCashNeeded = downPayment + totalClosingCosts;

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
      monthlyPMI: Math.round(monthlyPMI),
      totalMonthly: Math.round(totalMonthly),
      totalInterest: Math.round(totalInterest),
      closingCosts,
      totalClosingCosts: Math.round(totalClosingCosts),
      totalCashNeeded: Math.round(totalCashNeeded),
    };
  }, [purchasePrice, downPaymentPercent, interestRate, loanTerm, maintenanceFee, monthlyTaxes, propertyType]);

  // Calculate pie chart percentages
  const pieData = useMemo(() => {
    const total = calculations.totalMonthly;
    if (total === 0) return { pi: 0, taxes: 0, maintenance: 0, insurance: 0, pmi: 0 };
    return {
      pi: (calculations.monthlyPrincipalInterest / total) * 100,
      taxes: (calculations.monthlyTaxes / total) * 100,
      maintenance: (calculations.maintenanceFee / total) * 100,
      insurance: (calculations.monthlyInsurance / total) * 100,
      pmi: (calculations.monthlyPMI / total) * 100,
    };
  }, [calculations]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Monthly Payment Calculator</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Total Monthly Payment */}
          <div className="bg-gradient-to-br from-brand-gold/10 to-brand-gold/5 rounded-xl p-6 text-center">
            <p className="text-sm text-gray-600 mb-1">Estimated Monthly Payment</p>
            <p className="text-4xl font-bold text-brand-dark">
              ${calculations.totalMonthly.toLocaleString()}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Purchase Price: ${purchasePrice.toLocaleString()}
            </p>
          </div>

          {/* Payment Breakdown Visual */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Monthly Breakdown</h3>
            <div className="h-4 rounded-full overflow-hidden flex shadow-inner">
              <div className="bg-brand-gold" style={{ width: `${pieData.pi}%` }} title="Principal & Interest" />
              <div className="bg-blue-500" style={{ width: `${pieData.taxes}%` }} title="Property Taxes" />
              <div className="bg-green-500" style={{ width: `${pieData.maintenance}%` }} title="Maintenance" />
              <div className="bg-purple-500" style={{ width: `${pieData.insurance}%` }} title="Insurance" />
              {pieData.pmi > 0 && <div className="bg-orange-500" style={{ width: `${pieData.pmi}%` }} title="PMI" />}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-brand-gold"></span>
                  <span className="text-gray-600">Principal & Interest</span>
                </div>
                <span className="font-medium">${calculations.monthlyPrincipalInterest.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  <span className="text-gray-600">Property Taxes</span>
                </div>
                <span className="font-medium">${calculations.monthlyTaxes.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                  <span className="text-gray-600">{propertyType === 'Co-op' ? 'Maintenance' : 'Common Charges'}</span>
                </div>
                <span className="font-medium">${calculations.maintenanceFee.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                  <span className="text-gray-600">Insurance</span>
                </div>
                <span className="font-medium">${calculations.monthlyInsurance.toLocaleString()}</span>
              </div>
              {calculations.monthlyPMI > 0 && (
                <div className="flex items-center justify-between col-span-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                    <span className="text-gray-600">PMI (until 20% equity)</span>
                  </div>
                  <span className="font-medium">${calculations.monthlyPMI.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Adjustable Inputs */}
          <div className="space-y-5 pt-4 border-t">
            <h3 className="text-sm font-medium text-gray-700">Adjust Your Loan</h3>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-gray-600">Down Payment</label>
                <span className="font-semibold">{downPaymentPercent}% (${calculations.downPayment.toLocaleString()})</span>
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
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>5%</span>
                <span>25%</span>
                <span>50%</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-gray-600">Interest Rate</label>
                <span className="font-semibold">{interestRate}%</span>
              </div>
              <input
                type="range"
                value={interestRate}
                onChange={(e) => setInterestRate(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                min={4}
                max={9}
                step={0.125}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>4%</span>
                <span>6.5%</span>
                <span>9%</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-gray-600">Loan Term</label>
              </div>
              <div className="flex gap-2">
                {[15, 20, 30].map((term) => (
                  <button
                    key={term}
                    onClick={() => setLoanTerm(term)}
                    className={`flex-1 py-2.5 text-sm rounded-lg border-2 transition-all ${
                      loanTerm === term
                        ? 'bg-brand-gold text-white border-brand-gold font-semibold'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-gold/50'
                    }`}
                  >
                    {term} years
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Closing Costs */}
          <div className="pt-4 border-t">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Estimated Closing Costs (NYC)</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Attorney Fees</span>
                <span>${(calculations.closingCosts.buyerAttorneyFee + calculations.closingCosts.bankAttorneyFee).toLocaleString()}</span>
              </div>
              {calculations.closingCosts.titleInsurance > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Title Insurance</span>
                  <span>${calculations.closingCosts.titleInsurance.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Title Search</span>
                <span>${calculations.closingCosts.titleSearch.toLocaleString()}</span>
              </div>
              {calculations.closingCosts.mortgageRecordingTax > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Mortgage Recording Tax</span>
                  <span>${calculations.closingCosts.mortgageRecordingTax.toLocaleString()}</span>
                </div>
              )}
              {calculations.closingCosts.mansionTax > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Mansion Tax (1%)</span>
                  <span>${calculations.closingCosts.mansionTax.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Bank/Lender Fees</span>
                <span>${calculations.closingCosts.bankFee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Appraisal & Credit</span>
                <span>${(calculations.closingCosts.appraisal + calculations.closingCosts.creditReport).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Misc. Fees</span>
                <span>${calculations.closingCosts.miscFees.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t font-semibold">
                <span>Total Closing Costs</span>
                <span>${calculations.totalClosingCosts.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Total Cash Needed */}
          <div className="bg-brand-dark text-white rounded-xl p-5">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-300">Total Cash Needed at Closing</p>
                <p className="text-2xl font-bold">${calculations.totalCashNeeded.toLocaleString()}</p>
              </div>
              <div className="text-right text-sm">
                <p className="text-gray-300">Down Payment</p>
                <p className="font-medium">${calculations.downPayment.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Loan Summary */}
          <div className="text-sm text-gray-500 space-y-1">
            <div className="flex justify-between">
              <span>Loan Amount</span>
              <span>${calculations.loanAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Interest ({loanTerm} years)</span>
              <span>${calculations.totalInterest.toLocaleString()}</span>
            </div>
          </div>

          <p className="text-xs text-gray-400 pt-2">
            *Estimates only. Actual costs may vary. Consult with a mortgage professional and attorney for accurate figures.
            NYC taxes include mortgage recording tax (2.25% for loans over $500k) and mansion tax (1% for purchases over $1M).
          </p>
        </div>
      </div>
    </div>
  );
}
