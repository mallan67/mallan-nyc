'use client';

import { useState } from 'react';
import RentVsBuyCalculator from './RentVsBuyCalculator';

export default function RentVsBuyStandalone() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState(750000);
  const [monthlyRent, setMonthlyRent] = useState(3500);

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">Rent vs. Buy Calculator</h3>
            <p className="text-sm text-gray-500">Side-by-side cost comparison for NYC</p>
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
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-gray-600">Comparable Purchase Price</label>
                <span className="font-medium">${purchasePrice.toLocaleString()}</span>
              </div>
              <input
                type="range"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                min={200000}
                max={5000000}
                step={25000}
              />
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-gray-600">Current Monthly Rent</label>
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
          </div>

          <div className="mt-4">
            <RentVsBuyCalculator
              purchasePrice={purchasePrice}
              monthlyRent={monthlyRent}
            />
          </div>
        </div>
      )}
    </div>
  );
}
