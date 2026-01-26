'use client';

import { useState, useMemo } from 'react';

interface RentVsBuyCalculatorProps {
  purchasePrice: number;
  monthlyRent?: number;
  maintenanceFee?: number;
  realEstateTaxes?: number;
  isRental?: boolean;
}

export default function RentVsBuyCalculator({
  purchasePrice,
  monthlyRent = 0,
  maintenanceFee = 0,
  realEstateTaxes = 0,
  isRental = false,
}: RentVsBuyCalculatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [downPaymentPercent, setDownPaymentPercent] = useState(20);
  const [interestRate, setInterestRate] = useState(6.5);
  const [yearsToStay, setYearsToStay] = useState(5);
  const [rentAmount, setRentAmount] = useState(monthlyRent || Math.round(purchasePrice * 0.004));
  const [annualRentIncrease, setAnnualRentIncrease] = useState(3);
  const [annualAppreciation, setAnnualAppreciation] = useState(3);

  const calculations = useMemo(() => {
    const downPayment = purchasePrice * (downPaymentPercent / 100);
    const loanAmount = purchasePrice - downPayment;
    const monthlyRate = interestRate / 100 / 12;
    const totalPayments = 30 * 12;

    // Monthly mortgage payment (P&I)
    const monthlyMortgage = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) /
      (Math.pow(1 + monthlyRate, totalPayments) - 1);

    // Monthly property taxes (convert annual to monthly if provided annually)
    const monthlyTaxes = realEstateTaxes > 1000 ? realEstateTaxes / 12 : realEstateTaxes;

    // Estimated insurance (0.5% of purchase price annually)
    const monthlyInsurance = (purchasePrice * 0.005) / 12;

    // Total monthly cost of owning
    const monthlyOwningCost = monthlyMortgage + maintenanceFee + monthlyTaxes + monthlyInsurance;

    // Calculate total costs over years
    let totalRentCost = 0;
    let currentRent = rentAmount;
    for (let year = 1; year <= yearsToStay; year++) {
      totalRentCost += currentRent * 12;
      currentRent *= (1 + annualRentIncrease / 100);
    }

    // Total buying costs
    const closingCosts = purchasePrice * 0.04; // 4% closing costs
    const totalMortgagePayments = monthlyMortgage * 12 * yearsToStay;
    const totalTaxes = monthlyTaxes * 12 * yearsToStay;
    const totalMaintenance = maintenanceFee * 12 * yearsToStay;
    const totalInsurance = monthlyInsurance * 12 * yearsToStay;

    // Equity built over time (simplified - assumes consistent payment to principal)
    let remainingBalance = loanAmount;
    for (let month = 1; month <= yearsToStay * 12; month++) {
      const interestPayment = remainingBalance * monthlyRate;
      const principalPayment = monthlyMortgage - interestPayment;
      remainingBalance -= principalPayment;
    }
    const equityBuilt = loanAmount - remainingBalance;

    // Home appreciation
    const futureHomeValue = purchasePrice * Math.pow(1 + annualAppreciation / 100, yearsToStay);
    const appreciationGain = futureHomeValue - purchasePrice;

    // Selling costs (6% realtor fees)
    const sellingCosts = futureHomeValue * 0.06;

    // Net cost of buying
    const totalBuyingCosts = downPayment + closingCosts + totalMortgagePayments + totalTaxes +
      totalMaintenance + totalInsurance + sellingCosts - equityBuilt - appreciationGain - downPayment;

    // Net cost of renting (with opportunity cost of down payment invested at 5%)
    const investmentReturn = downPayment * (Math.pow(1.05, yearsToStay) - 1);
    const netRentCost = totalRentCost - investmentReturn;

    const buyIsBetter = totalBuyingCosts < netRentCost;
    const savings = Math.abs(netRentCost - totalBuyingCosts);

    return {
      monthlyMortgage: Math.round(monthlyMortgage),
      monthlyOwningCost: Math.round(monthlyOwningCost),
      totalRentCost: Math.round(totalRentCost),
      totalBuyingCosts: Math.round(totalBuyingCosts),
      netRentCost: Math.round(netRentCost),
      equityBuilt: Math.round(equityBuilt),
      appreciationGain: Math.round(appreciationGain),
      buyIsBetter,
      savings: Math.round(savings),
      breakEvenYears: buyIsBetter ? yearsToStay : Math.ceil(yearsToStay * (totalBuyingCosts / netRentCost)),
    };
  }, [purchasePrice, downPaymentPercent, interestRate, yearsToStay, rentAmount,
      annualRentIncrease, annualAppreciation, maintenanceFee, realEstateTaxes]);

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">Rent vs. Buy Calculator</h3>
            <p className="text-sm text-gray-500">Should you rent or buy?</p>
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
          {/* Result Summary */}
          <div className={`mt-4 p-4 rounded-lg ${calculations.buyIsBetter ? 'bg-green-50' : 'bg-blue-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                calculations.buyIsBetter ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {calculations.buyIsBetter ? 'BUYING IS BETTER' : 'RENTING IS BETTER'}
              </span>
            </div>
            <p className={`text-lg font-semibold ${calculations.buyIsBetter ? 'text-green-700' : 'text-blue-700'}`}>
              You could save ${calculations.savings.toLocaleString()} over {yearsToStay} years
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {calculations.buyIsBetter
                ? `Building ${calculations.equityBuilt.toLocaleString()} in equity plus ${calculations.appreciationGain.toLocaleString()} in appreciation`
                : `Investing your down payment could earn more than the equity you'd build`
              }
            </p>
          </div>

          {/* Inputs */}
          <div className="mt-6 space-y-4">
            <h4 className="font-medium text-gray-900 text-sm">Adjust Your Scenario</h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Monthly Rent</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    value={rentAmount}
                    onChange={(e) => setRentAmount(Number(e.target.value))}
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
                    min={0}
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
                    step={0.1}
                    min={0}
                    max={15}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Years to Stay</label>
                <input
                  type="number"
                  value={yearsToStay}
                  onChange={(e) => setYearsToStay(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-brand-gold focus:border-brand-gold"
                  min={1}
                  max={30}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Annual Rent Increase</label>
                <div className="relative">
                  <input
                    type="number"
                    value={annualRentIncrease}
                    onChange={(e) => setAnnualRentIncrease(Number(e.target.value))}
                    className="w-full pl-3 pr-7 py-2 border rounded text-sm focus:ring-1 focus:ring-brand-gold focus:border-brand-gold"
                    step={0.5}
                    min={0}
                    max={10}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Home Appreciation</label>
                <div className="relative">
                  <input
                    type="number"
                    value={annualAppreciation}
                    onChange={(e) => setAnnualAppreciation(Number(e.target.value))}
                    className="w-full pl-3 pr-7 py-2 border rounded text-sm focus:ring-1 focus:ring-brand-gold focus:border-brand-gold"
                    step={0.5}
                    min={-5}
                    max={15}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cost Comparison */}
          <div className="mt-6 pt-4 border-t">
            <h4 className="font-medium text-gray-900 text-sm mb-3">Cost Breakdown Over {yearsToStay} Years</h4>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Monthly Buying Cost</span>
                <span className="font-medium">${calculations.monthlyOwningCost.toLocaleString()}/mo</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Monthly Mortgage (P&I)</span>
                <span className="text-gray-500">${calculations.monthlyMortgage.toLocaleString()}/mo</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm text-gray-600">Total Rent Cost</span>
                <span className="font-medium">${calculations.totalRentCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Net Rent Cost (after investment gains)</span>
                <span className="text-gray-500">${calculations.netRentCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm text-gray-600">Net Buying Cost</span>
                <span className="font-medium">${calculations.totalBuyingCosts.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Equity Built</span>
                <span className="text-green-600">+${calculations.equityBuilt.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Appreciation Gain</span>
                <span className="text-green-600">+${calculations.appreciationGain.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            *This calculator provides estimates only. Actual costs may vary. Consult a financial advisor
            for personalized advice. Assumes 30-year fixed mortgage, 4% closing costs, 6% selling costs,
            and 5% annual return on invested down payment.
          </p>
        </div>
      )}
    </div>
  );
}
