'use client';

import { useState, useMemo } from 'react';

const APT_SIZES = [
  { label: 'Studio', value: 'studio', movingCost: 800 },
  { label: '1 Bedroom', value: '1br', movingCost: 1200 },
  { label: '2 Bedrooms', value: '2br', movingCost: 2000 },
  { label: '3+ Bedrooms', value: '3br', movingCost: 3000 },
] as const;

type AptSize = typeof APT_SIZES[number]['value'];

export default function MovingCostEstimator() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [monthlyRent, setMonthlyRent] = useState(3500);
  const [aptSize, setAptSize] = useState<AptSize>('1br');
  const [hasBrokerFee, setHasBrokerFee] = useState(false);

  const calculations = useMemo(() => {
    const sizeInfo = APT_SIZES.find((s) => s.value === aptSize)!;
    const brokerFee = hasBrokerFee ? monthlyRent : 0;
    const firstMonth = monthlyRent;
    const securityDeposit = monthlyRent;
    const movingCompany = sizeInfo.movingCost;
    const utilitiesSetup = 300;

    const total = brokerFee + firstMonth + securityDeposit + movingCompany + utilitiesSetup;

    return {
      brokerFee,
      firstMonth,
      securityDeposit,
      movingCompany,
      utilitiesSetup,
      total,
    };
  }, [monthlyRent, aptSize, hasBrokerFee]);

  return (
    <div className="glass-card rounded-3xl overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="font-display font-semibold text-brand-dark">NYC Moving Cost Estimator</h3>
            <p className="text-sm text-brand-dark/85">Total move-in costs at a glance</p>
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
          {/* Total */}
          <div className="mt-4 bg-amber-50/60 rounded-2xl p-4 text-center">
            <p className="text-xs text-brand-dark/85 uppercase tracking-wide mb-1">Estimated Total Move-In Cost</p>
            <p className="text-3xl font-display font-bold text-brand-dark">
              ${calculations.total.toLocaleString()}
            </p>
          </div>

          {/* Line items */}
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-brand-dark/90">First month&apos;s rent</span>
              <span className="font-medium">${calculations.firstMonth.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-brand-dark/90">Security deposit</span>
              <span className="font-medium">${calculations.securityDeposit.toLocaleString()}</span>
            </div>
            {hasBrokerFee && (
              <div className="flex justify-between py-1">
                <span className="text-brand-dark/90">Broker fee (1 month)</span>
                <span className="font-medium">${calculations.brokerFee.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-brand-dark/90">Moving company</span>
              <span className="font-medium">${calculations.movingCompany.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-brand-dark/90">Utilities setup</span>
              <span className="font-medium">${calculations.utilitiesSetup.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-black/5 font-medium">
              <span className="text-brand-dark/95">Total</span>
              <span className="text-brand-dark">${calculations.total.toLocaleString()}</span>
            </div>
          </div>

          {/* Inputs */}
          <div className="mt-6 space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-brand-dark/90">Monthly Rent</label>
                <span className="font-medium">${monthlyRent.toLocaleString()}</span>
              </div>
              <input
                type="range"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                min={1500}
                max={15000}
                step={100}
              />
            </div>

            <div>
              <label className="block text-sm text-brand-dark/90 mb-2">Apartment Size</label>
              <div className="grid grid-cols-4 gap-2">
                {APT_SIZES.map((size) => (
                  <button
                    key={size.value}
                    onClick={() => setAptSize(size.value)}
                    className={`py-2 text-xs font-medium rounded-2xl transition-colors ${
                      aptSize === size.value
                        ? 'bg-brand-gold text-white'
                        : 'bg-white/60 text-brand-dark/90 ring-1 ring-black/5 hover:bg-white/80'
                    }`}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-brand-dark/90">Broker fee (1 month)</span>
              <button
                onClick={() => setHasBrokerFee(!hasBrokerFee)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  hasBrokerFee ? 'bg-brand-gold' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    hasBrokerFee ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <p className="mt-4 text-xs text-brand-dark/90">
            *Estimates based on typical NYC move-in costs. Actual costs vary by building,
            location, and moving company. Some buildings may require additional deposits
            or fees.
          </p>
        </div>
      )}
    </div>
  );
}
