'use client';

import { useState } from 'react';
import MortgageModal from './MortgageModal';

interface PriceWithCalculatorProps {
  price: number;
  originalPrice?: number;
  isRental: boolean;
  maintenanceFee: number;
  monthlyTaxes: number;
  propertyType: string;
}

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) {
    return `$${price.toLocaleString()}/mo`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

export default function PriceWithCalculator({
  price,
  originalPrice,
  isRental,
  maintenanceFee,
  monthlyTaxes,
  propertyType,
}: PriceWithCalculatorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-3xl md:text-4xl font-sans">
          {formatPrice(price, isRental)}
        </h1>
        {!isRental && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="group flex items-center gap-1.5 px-3 py-1.5 bg-brand-gold/10 hover:bg-brand-gold/20 text-brand-gold rounded-full transition-all"
            title="Calculate monthly payment"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium">Est. Payment</span>
          </button>
        )}
      </div>
      {originalPrice && originalPrice > price && (
        <p className="text-sm text-gray-500 line-through mb-1">
          Was {formatPrice(originalPrice, isRental)}
        </p>
      )}

      {/* Mortgage Modal */}
      <MortgageModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        purchasePrice={price}
        maintenanceFee={maintenanceFee}
        monthlyTaxes={monthlyTaxes}
        propertyType={propertyType}
      />
    </>
  );
}
