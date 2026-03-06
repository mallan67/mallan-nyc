'use client';

import { useState } from 'react';

interface PastDealDTO {
  id: string | null;
  listingKey: string | null;
  street: string;
  unit: string | null;
  city: string;
  postalCode: string;
  neighborhood: string;
  closePrice: number | null;
  listPrice: number | null;
  closeDate: string | null;
  beds: number | null;
  bathsFull: number | null;
  bathsHalf: number | null;
  sqft: number | null;
  propertyType: string;
  dealType: 'sale' | 'rent';
  photoUrl: string | null;
  listingCourtesy: string | null;
  source: 'trestle' | 'manual';
}

const PER_PAGE = 12;

function formatPrice(price: number, isRent: boolean): string {
  if (isRent) return `$${price.toLocaleString()}/mo`;
  return `$${price.toLocaleString()}`;
}

function PastDealCard({ deal }: { deal: PastDealDTO }) {
  const price = deal.closePrice && deal.closePrice > 1 ? deal.closePrice : deal.listPrice;
  const isRent = deal.dealType === 'rent';
  const hasPhoto = !!deal.photoUrl;
  const hasCourtesy = !!deal.listingCourtesy;
  const isRLS = deal.source === 'trestle';

  const bedsLabel = deal.beds != null
    ? (deal.beds === 0 ? 'Studio' : `${deal.beds} bed${deal.beds > 1 ? 's' : ''}`)
    : null;
  const totalBaths = (deal.bathsFull || 0) + (deal.bathsHalf || 0) * 0.5;
  const bathsLabel = totalBaths > 0 ? `${totalBaths} bath${totalBaths > 1 ? 's' : ''}` : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden flex">
      {/* Photo / Placeholder — left side */}
      <div className="flex-shrink-0 w-[120px] sm:w-[140px] bg-gray-50 flex items-center justify-center relative overflow-hidden">
        {hasPhoto ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={deal.photoUrl!}
            alt={deal.street}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <svg className="w-10 h-10 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={0.8}>
            <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
          </svg>
        )}
      </div>

      {/* Info — right side */}
      <div className="flex-1 px-3 py-2.5 flex flex-col justify-between min-w-0">
        <div>
          {/* Price + Property Type */}
          <div className="flex items-baseline justify-between gap-2">
            {price && price > 1 ? (
              <p className="font-bold text-[15px] text-brand-dark leading-tight">
                {formatPrice(price, isRent)}
              </p>
            ) : (
              <p className="text-[13px] text-brand-dark/30">&mdash;</p>
            )}
            {deal.propertyType && deal.propertyType !== 'Residential' && (
              <span className="text-[10px] text-brand-dark/40 flex-shrink-0">
                {deal.propertyType}
              </span>
            )}
          </div>

          {/* Details row */}
          <div className="flex items-center gap-1 text-[12px] text-brand-dark/70 mt-0.5 flex-wrap">
            {bedsLabel && <span>{bedsLabel}</span>}
            {bedsLabel && bathsLabel && <span className="text-brand-dark/30">|</span>}
            {bathsLabel && <span>{bathsLabel}</span>}
            {deal.sqft && deal.sqft > 0 && (
              <>
                <span className="text-brand-dark/30">|</span>
                <span>{deal.sqft.toLocaleString()} sqft</span>
              </>
            )}
          </div>

          {/* Address */}
          <p className="text-[13px] text-brand-dark/80 mt-1 truncate">
            {deal.street}{deal.unit ? `, ${deal.unit}` : ''}
          </p>
          <p className="text-[11px] text-brand-dark/50">
            {deal.neighborhood || deal.city}
          </p>
        </div>

        {/* Bottom row: Listing Courtesy + RLS badge */}
        {(hasCourtesy || isRLS) && (
          <div className="flex items-end justify-between mt-1.5 gap-2">
            {hasCourtesy ? (
              <p className="text-[10px] text-brand-dark/40 leading-tight truncate">
                Listing Courtesy of {deal.listingCourtesy}
              </p>
            ) : (
              <span />
            )}
            {isRLS && (
              <span className="flex-shrink-0 text-[10px] font-bold text-red-500 tracking-wide">
                RLS
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-8">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded text-brand-dark/60 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`dots-${i}`} className="px-2 py-1.5 text-xs text-brand-dark/30">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-8 h-8 flex items-center justify-center text-xs rounded border ${
              p === page
                ? 'border-brand-dark bg-brand-dark text-white font-medium'
                : 'border-gray-200 text-brand-dark/60 hover:bg-gray-50'
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded text-brand-dark/60 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

export default function PastDealsSection({ sales, rentals }: { sales: PastDealDTO[]; rentals: PastDealDTO[] }) {
  const [activeTab, setActiveTab] = useState<'sales' | 'rentals'>('sales');
  const [salesPage, setSalesPage] = useState(1);
  const [rentalsPage, setRentalsPage] = useState(1);

  const hasSales = sales.length > 0;
  const hasRentals = rentals.length > 0;
  if (!hasSales && !hasRentals) return null;

  const currentDeals = activeTab === 'sales' ? sales : rentals;
  const currentPage = activeTab === 'sales' ? salesPage : rentalsPage;
  const setPage = activeTab === 'sales' ? setSalesPage : setRentalsPage;
  const totalPages = Math.ceil(currentDeals.length / PER_PAGE);
  const pageDeals = currentDeals.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  return (
    <section className="py-10 scroll-mt-32">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-lg font-display font-semibold text-brand-dark mb-4 pb-2 border-b border-black/5">
          Past {activeTab === 'sales' ? 'Sales' : 'Rentals'}
        </h2>

        {/* Tabs */}
        <div className="flex gap-0 mb-6 border-b border-gray-200">
          {hasSales && (
            <button
              onClick={() => { setActiveTab('sales'); }}
              className={`px-6 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'sales'
                  ? 'border-brand-dark text-brand-dark'
                  : 'border-transparent text-brand-dark/40 hover:text-brand-dark/60'
              }`}
            >
              Sales ({sales.length})
            </button>
          )}
          {hasRentals && (
            <button
              onClick={() => { setActiveTab('rentals'); }}
              className={`px-6 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'rentals'
                  ? 'border-brand-dark text-brand-dark'
                  : 'border-transparent text-brand-dark/40 hover:text-brand-dark/60'
              }`}
            >
              Rentals ({rentals.length})
            </button>
          )}
        </div>

        {/* Cards grid — 3 columns, horizontal cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pageDeals.map((deal, idx) => (
            <PastDealCard key={deal.id || `${activeTab}-${(currentPage - 1) * PER_PAGE + idx}`} deal={deal} />
          ))}
        </div>

        {/* Pagination */}
        <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </section>
  );
}
