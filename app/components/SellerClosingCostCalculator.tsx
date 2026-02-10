'use client';

import { useState, useMemo } from 'react';

export default function SellerClosingCostCalculator() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [salePrice, setSalePrice] = useState(1500000);
  const [propertyType, setPropertyType] = useState<'condo' | 'coop'>('condo');
  const [hasFlipTax, setHasFlipTax] = useState(false);

  const calculations = useMemo(() => {
    // NYC transfer tax: 1% under $500K, 1.425% at $500K+
    const nycTransferRate = salePrice < 500000 ? 0.01 : 0.01425;
    const nycTransferTax = propertyType === 'condo' ? salePrice * nycTransferRate : 0;

    // NYS transfer tax: $2 per $500 (0.4%), plus mansion tax supplement at $3M+
    const nysTransferRate = salePrice >= 3000000 ? 0.0065 : 0.004;
    const nysTransferTax = propertyType === 'condo' ? salePrice * nysTransferRate : 0;

    // Attorney fees
    const attorneyFees = 3500;

    // Broker commission (5%)
    const brokerCommission = salePrice * 0.05;

    // Flip tax (co-op only, ~2% typical)
    const flipTax = propertyType === 'coop' && hasFlipTax ? salePrice * 0.02 : 0;

    // Move-out deposit (co-op/condo building)
    const moveOutDeposit = 1000;

    // Payoff/satisfaction fees
    const payoffFees = 500;

    const total =
      nycTransferTax +
      nysTransferTax +
      attorneyFees +
      brokerCommission +
      flipTax +
      moveOutDeposit +
      payoffFees;

    const netProceeds = salePrice - total;

    return {
      nycTransferTax,
      nysTransferTax,
      attorneyFees,
      brokerCommission,
      flipTax,
      moveOutDeposit,
      payoffFees,
      total,
      netProceeds,
    };
  }, [salePrice, propertyType, hasFlipTax]);

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">Seller Closing Costs</h3>
            <p className="text-sm text-gray-500">Estimate your net proceeds</p>
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
          {/* Net Proceeds */}
          <div className="mt-4 bg-green-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Estimated Net Proceeds</p>
            <p className="text-3xl font-bold text-gray-900">
              ${calculations.netProceeds.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Total closing costs: ${calculations.total.toLocaleString()}
            </p>
          </div>

          {/* Line items */}
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Broker commission (5%)</span>
              <span className="font-medium">${calculations.brokerCommission.toLocaleString()}</span>
            </div>
            {propertyType === 'condo' && (
              <>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">
                    NYC transfer tax ({salePrice < 500000 ? '1%' : '1.425%'})
                  </span>
                  <span className="font-medium">${Math.round(calculations.nycTransferTax).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">
                    NYS transfer tax ({salePrice >= 3000000 ? '0.65%' : '0.4%'})
                  </span>
                  <span className="font-medium">${Math.round(calculations.nysTransferTax).toLocaleString()}</span>
                </div>
              </>
            )}
            {calculations.flipTax > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Flip tax (~2%)</span>
                <span className="font-medium">${calculations.flipTax.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Attorney fees</span>
              <span className="font-medium">${calculations.attorneyFees.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Move-out deposit</span>
              <span className="font-medium">${calculations.moveOutDeposit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Payoff &amp; recording fees</span>
              <span className="font-medium">${calculations.payoffFees.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-2 border-t font-medium">
              <span className="text-gray-700">Total Closing Costs</span>
              <span className="text-gray-900">${calculations.total.toLocaleString()}</span>
            </div>
          </div>

          {/* Inputs */}
          <div className="mt-6 space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-gray-600">Sale Price</label>
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

            <div>
              <label className="block text-sm text-gray-600 mb-2">Property Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(['condo', 'coop'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setPropertyType(type)}
                    className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                      propertyType === type
                        ? 'bg-brand-gold text-white border-brand-gold'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {type === 'condo' ? 'Condo' : 'Co-op'}
                  </button>
                ))}
              </div>
            </div>

            {propertyType === 'coop' && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Flip tax (~2%)</span>
                <button
                  onClick={() => setHasFlipTax(!hasFlipTax)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    hasFlipTax ? 'bg-brand-gold' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      hasFlipTax ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>

          <p className="mt-4 text-xs text-gray-400">
            *Estimates only. Co-op sellers typically do not pay transfer taxes (paid by the
            corporation). Flip tax rates vary by building. Actual costs depend on your specific
            property and transaction. Consult a real estate attorney for exact figures.
          </p>
        </div>
      )}
    </div>
  );
}
