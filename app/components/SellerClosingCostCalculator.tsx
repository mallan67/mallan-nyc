'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

type PropertyType = 'condo' | 'coop' | 'townhouse' | 'multifamily' | 'commercial';
type Timeline = '0-30' | '30-60' | '60-90';

const PROPERTY_TYPES: { label: string; value: PropertyType }[] = [
  { label: 'Condo', value: 'condo' },
  { label: 'Co-op', value: 'coop' },
  { label: 'Townhouse', value: 'townhouse' },
  { label: 'Multi-family', value: 'multifamily' },
  { label: 'Commercial', value: 'commercial' },
];

const TIMELINES: { label: string; value: Timeline }[] = [
  { label: '0–30 days', value: '0-30' },
  { label: '30–60 days', value: '30-60' },
  { label: '60–90+ days', value: '60-90' },
];

// Transfer taxes apply to condos, townhouses, multifamily, commercial (real property)
// Co-ops = shares, not real property — no transfer tax (corp pays)
function paysTransferTax(type: PropertyType) {
  return type !== 'coop';
}

export default function SellerClosingCostCalculator() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [salePrice, setSalePrice] = useState(1500000);
  const [mortgageBalance, setMortgageBalance] = useState(0);
  const [propertyType, setPropertyType] = useState<PropertyType>('condo');
  const [timeline, setTimeline] = useState<Timeline>('30-60');

  const calculations = useMemo(() => {
    // Broker commission (5%)
    const brokerCommission = salePrice * 0.05;

    // NYC transfer tax: 1% under $500K, 1.425% at $500K+
    const nycTransferRate = salePrice < 500000 ? 0.01 : 0.01425;
    const nycTransferTax = paysTransferTax(propertyType) ? salePrice * nycTransferRate : 0;

    // NYS transfer tax: 0.4%, or 0.65% at $3M+
    const nysTransferRate = salePrice >= 3000000 ? 0.0065 : 0.004;
    const nysTransferTax = paysTransferTax(propertyType) ? salePrice * nysTransferRate : 0;

    const transferTaxes = nycTransferTax + nysTransferTax;

    // Flip tax (co-op only, ~2% typical)
    const flipTax = propertyType === 'coop' ? salePrice * 0.02 : 0;

    // Attorney fees
    const attorneyFees = 3500;

    // Move-out / misc (deposit, payoff, recording)
    const miscFees = 1500;

    const totalClosingCosts =
      brokerCommission + transferTaxes + flipTax + attorneyFees + miscFees;

    const netProceeds = salePrice - totalClosingCosts - mortgageBalance;

    return {
      brokerCommission,
      nycTransferTax,
      nysTransferTax,
      transferTaxes,
      flipTax,
      attorneyFees,
      miscFees,
      totalClosingCosts,
      netProceeds,
    };
  }, [salePrice, mortgageBalance, propertyType]);

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">Net Proceeds Calculator</h3>
            <p className="text-sm text-gray-500">How much will you walk away with?</p>
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
          {/* Net Proceeds — big bold number */}
          <div className="mt-4 bg-green-50 rounded-lg p-5 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Estimated Net Proceeds</p>
            <p className="text-4xl font-bold text-gray-900">
              ${calculations.netProceeds.toLocaleString()}
            </p>
          </div>

          {/* Breakdown */}
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Broker commission (5%)</span>
              <span className="font-medium text-gray-900">${Math.round(calculations.brokerCommission).toLocaleString()}</span>
            </div>
            {paysTransferTax(propertyType) && (
              <>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">NYC transfer tax ({salePrice < 500000 ? '1%' : '1.425%'})</span>
                  <span className="font-medium text-gray-900">${Math.round(calculations.nycTransferTax).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">NYS transfer tax ({salePrice >= 3000000 ? '0.65%' : '0.4%'})</span>
                  <span className="font-medium text-gray-900">${Math.round(calculations.nysTransferTax).toLocaleString()}</span>
                </div>
              </>
            )}
            {calculations.flipTax > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Flip tax (~2%)</span>
                <span className="font-medium text-gray-900">${Math.round(calculations.flipTax).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Attorney fees</span>
              <span className="font-medium text-gray-900">${calculations.attorneyFees.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Move-out &amp; misc fees</span>
              <span className="font-medium text-gray-900">${calculations.miscFees.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-2 border-t font-semibold">
              <span className="text-gray-700">Total Closing Costs</span>
              <span className="text-gray-900">${Math.round(calculations.totalClosingCosts).toLocaleString()}</span>
            </div>
            {mortgageBalance > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Mortgage payoff</span>
                <span className="font-medium text-gray-900">${mortgageBalance.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Inputs */}
          <div className="mt-6 space-y-4">
            {/* Sale Price */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-gray-600">Estimated Sale Price</label>
                <span className="font-medium">${salePrice.toLocaleString()}</span>
              </div>
              <input
                type="range"
                value={salePrice}
                onChange={(e) => setSalePrice(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                min={200000}
                max={10000000}
                step={50000}
              />
            </div>

            {/* Mortgage Balance */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-gray-600">Mortgage Balance (optional)</label>
                <span className="font-medium">{mortgageBalance > 0 ? `$${mortgageBalance.toLocaleString()}` : 'None'}</span>
              </div>
              <input
                type="range"
                value={mortgageBalance}
                onChange={(e) => setMortgageBalance(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                min={0}
                max={5000000}
                step={25000}
              />
            </div>

            {/* Property Type */}
            <div>
              <label className="block text-sm text-gray-600 mb-2">Property Type</label>
              <div className="grid grid-cols-3 gap-2">
                {PROPERTY_TYPES.map((pt) => (
                  <button
                    key={pt.value}
                    onClick={() => setPropertyType(pt.value)}
                    className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                      propertyType === pt.value
                        ? 'bg-brand-gold text-white border-brand-gold'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Closing Timeline */}
            <div>
              <label className="block text-sm text-gray-600 mb-2">Closing Timeline</label>
              <div className="grid grid-cols-3 gap-2">
                {TIMELINES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTimeline(t.value)}
                    className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                      timeline === t.value
                        ? 'bg-brand-gold text-white border-brand-gold'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* CTA */}
          <Link
            href="/contact?ref=net-proceeds"
            data-analytics-cta="cta_net_proceeds"
            className="mt-5 block w-full text-center py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors text-sm"
          >
            Get Exact Net Sheet + Pricing Strategy
          </Link>

          <p className="mt-3 text-xs text-gray-400">
            *Estimates only. Co-op sellers typically do not pay transfer taxes directly.
            Flip tax rates vary by building (1–3%). Actual costs depend on your property
            and transaction terms. Consult a real estate attorney for exact figures.
          </p>
        </div>
      )}
    </div>
  );
}
