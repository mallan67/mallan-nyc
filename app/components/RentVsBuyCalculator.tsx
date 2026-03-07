'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

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
}: RentVsBuyCalculatorProps) {
  const [downPaymentPercent, setDownPaymentPercent] = useState(20);
  const [interestRate, setInterestRate] = useState(6.5);
  const [yearsToStay, setYearsToStay] = useState(5);
  const [rentAmount, setRentAmount] = useState(monthlyRent || Math.round(purchasePrice * 0.004));
  const [annualRentIncrease, setAnnualRentIncrease] = useState(3);
  const [annualAppreciation, _setAnnualAppreciation] = useState(3);

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

    // Equity built over time
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

    // Estimated purchase price for comparison
    const estimatedPurchasePrice = purchasePrice;

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
      estimatedPurchasePrice: Math.round(estimatedPurchasePrice),
      downPayment: Math.round(downPayment),
    };
  }, [purchasePrice, downPaymentPercent, interestRate, yearsToStay, rentAmount,
      annualRentIncrease, annualAppreciation, maintenanceFee, realEstateTaxes]);

  return (
    <div className="glass-card rounded-3xl overflow-hidden">
      {/* Subtle Header */}
      <div className="bg-gray-50/50 border-b border-black/5 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          </div>
          <div>
            <h3 className="font-display font-semibold text-brand-dark">Should You Buy Instead?</h3>
            <p className="text-brand-dark/85 text-sm">Compare renting vs. owning</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Result Summary - Always Visible */}
        <div className={`p-4 rounded-2xl ${calculations.buyIsBetter ? 'bg-green-50/60' : 'bg-gray-50/50'}`}>
          <div className="flex items-center gap-2 mb-2">
            {calculations.buyIsBetter ? (
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-brand-dark/85" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className={`text-sm font-medium ${
              calculations.buyIsBetter ? 'text-green-700' : 'text-brand-dark/90'
            }`}>
              {calculations.buyIsBetter ? 'Buying could save you money' : 'Renting may be right for now'}
            </span>
          </div>
          <p className={`text-xl font-display font-semibold ${calculations.buyIsBetter ? 'text-green-700' : 'text-brand-dark/95'}`}>
            ${calculations.savings.toLocaleString()} {calculations.buyIsBetter ? 'potential savings' : 'difference'}
          </p>
          <p className="text-sm text-brand-dark/85 mt-1">
            Over {yearsToStay} years {calculations.buyIsBetter
              ? `with $${calculations.equityBuilt.toLocaleString()} in equity`
              : 'when factoring in all costs'}
          </p>
        </div>

        {/* Quick Comparison */}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="bg-white/60 rounded-2xl p-4 text-center ring-1 ring-black/5">
            <p className="text-xs text-brand-dark/85 uppercase tracking-wide mb-1">Continue Renting</p>
            <p className="text-xl font-display font-bold text-brand-dark">${rentAmount.toLocaleString()}/mo</p>
            <p className="text-sm text-brand-dark/85 mt-1">${calculations.totalRentCost.toLocaleString()} over {yearsToStay}yr</p>
          </div>
          <div className="bg-white/60 rounded-2xl p-4 text-center ring-1 ring-black/5">
            <p className="text-xs text-brand-dark/85 uppercase tracking-wide mb-1">If You Buy</p>
            <p className="text-xl font-display font-bold text-brand-dark">${calculations.monthlyOwningCost.toLocaleString()}/mo</p>
            <p className="text-sm text-green-600 mt-1">+${calculations.equityBuilt.toLocaleString()} equity</p>
          </div>
        </div>

        {/* Comparable Purchase */}
        <div className="mt-4 bg-white/60 rounded-2xl p-4 ring-1 ring-black/5">
          <p className="text-sm text-brand-dark/90 mb-2">Estimated comparable purchase price:</p>
          <p className="text-2xl font-display font-bold text-brand-dark">${calculations.estimatedPurchasePrice.toLocaleString()}</p>
          <p className="text-xs text-brand-dark/85 mt-1">
            Down payment needed: ${calculations.downPayment.toLocaleString()} ({downPaymentPercent}%)
          </p>
        </div>

        {/* Adjust Scenario */}
        <div className="mt-5 pt-4 border-t border-black/5">
          <h4 className="font-display font-medium text-brand-dark/95 text-sm mb-4">Adjust Your Scenario</h4>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-brand-dark/90">Current Monthly Rent</label>
                <span className="font-medium">${rentAmount.toLocaleString()}</span>
              </div>
              <input
                type="range"
                value={rentAmount}
                onChange={(e) => setRentAmount(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                min={1500}
                max={15000}
                step={100}
              />
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-brand-dark/90">Down Payment</label>
                <span className="font-medium">{downPaymentPercent}%</span>
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
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-brand-dark/90">Years You Plan to Stay</label>
                <span className="font-medium">{yearsToStay} years</span>
              </div>
              <input
                type="range"
                value={yearsToStay}
                onChange={(e) => setYearsToStay(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                min={1}
                max={15}
                step={1}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                    max={10}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-dark/90">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-brand-dark/85 mb-1">Annual Rent Increase</label>
                <div className="relative">
                  <input
                    type="number"
                    value={annualRentIncrease}
                    onChange={(e) => setAnnualRentIncrease(Number(e.target.value))}
                    className="w-full pl-3 pr-7 py-2 rounded-2xl bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                    step={0.5}
                    min={0}
                    max={10}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-dark/90">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="mt-5 pt-4 border-t border-black/5">
          <h4 className="font-display font-semibold text-brand-dark text-sm mb-3">{yearsToStay}-Year Cost Comparison</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-brand-dark/90">Total rent paid</span>
              <span className="font-medium text-red-600">-${calculations.totalRentCost.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-dark/90">Net buying cost</span>
              <span className="font-medium">-${calculations.totalBuyingCosts.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-dark/90">Equity you&apos;d build</span>
              <span className="font-medium text-green-600">+${calculations.equityBuilt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-dark/90">Est. appreciation</span>
              <span className="font-medium text-green-600">+${calculations.appreciationGain.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-6 bg-brand-gold/10 rounded-2xl p-4 text-center">
          <p className="text-sm font-medium text-brand-dark mb-1">Interested in exploring homeownership?</p>
          <p className="text-xs text-brand-dark/85 mb-3">Contact us to discuss your options and find properties in your budget.</p>
          <Link
            href="/contact?ref=rent-vs-buy"
            data-analytics-cta="cta_rent_vs_buy"
            className="inline-block w-full py-3 bg-brand-dark text-white font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors text-sm"
          >
            Let&apos;s Talk
          </Link>
        </div>

        <p className="mt-4 text-xs text-brand-dark/90">
          *Estimates only. Assumes 30-year fixed mortgage, 4% closing costs, 6% selling costs.
          Actual costs vary. Consult a financial advisor for personalized advice.
        </p>
      </div>
    </div>
  );
}
