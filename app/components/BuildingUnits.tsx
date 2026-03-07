'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ActiveUnit {
  id: string;
  mlsId: string;
  listPrice: number;
  beds: number;
  baths: number;
  bathsHalf: number;
  sqft: number;
  unit: string;
  propertyType: string;
  office: string;
}

interface SaleRecord {
  id: string;
  mlsId: string;
  closePrice: number;
  beds: number;
  baths: number;
  sqft: number;
  unit: string;
  closeDate: string | null;
  propertyType: string;
  office: string;
}

interface BuildingUnitsProps {
  streetNumber: string;
  streetName: string;
  postalCode: string;
  currentListingId: string;
  buildingName?: string;
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(2)}M`;
  return `$${price.toLocaleString()}`;
}

export default function BuildingUnits({
  streetNumber,
  streetName,
  postalCode,
  currentListingId,
  buildingName,
}: BuildingUnitsProps) {
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [activeUnits, setActiveUnits] = useState<ActiveUnit[]>([]);
  const [saleHistory, setSaleHistory] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({
      streetNumber,
      streetName,
      postalCode,
      excludeId: currentListingId,
    });
    fetch(`/api/listings/building?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setActiveUnits(data.activeUnits || []);
        setSaleHistory(data.saleHistory || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [streetNumber, streetName, postalCode, currentListingId]);

  // Don't render section if nothing to show
  if (!loading && activeUnits.length === 0 && saleHistory.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-display font-semibold">
          {buildingName || `${streetNumber} ${streetName}`}
        </h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5 mb-4 w-fit">
        <button
          onClick={() => setTab('active')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'active' ? 'bg-white text-brand-dark shadow-sm' : 'text-brand-dark/60 hover:text-brand-dark'
          }`}
        >
          Available Units{activeUnits.length > 0 && ` (${activeUnits.length})`}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'history' ? 'bg-white text-brand-dark shadow-sm' : 'text-brand-dark/60 hover:text-brand-dark'
          }`}
        >
          Sale History{saleHistory.length > 0 && ` (${saleHistory.length})`}
        </button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Active Units */}
      {!loading && tab === 'active' && (
        <div className="space-y-2">
          {activeUnits.length === 0 ? (
            <div className="glass-card rounded-2xl p-6 text-center">
              <p className="text-brand-dark/70 mb-3">No other units currently listed in this building.</p>
              <p className="text-sm text-brand-dark/50">
                Interested in units here?
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-3">
                <a
                  href="tel:646-258-4460"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-dark text-white text-sm font-medium rounded-xl hover:bg-brand-dark/90 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Call 646-258-4460
                </a>
                <a
                  href="mailto:info@mallan.nyc?subject=Inquiry about units at ${streetNumber} ${streetName}"
                  className="inline-flex items-center gap-1.5 px-4 py-2 ring-1 ring-black/10 text-brand-dark text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email Us
                </a>
              </div>
            </div>
          ) : (
            activeUnits.map((unit) => (
              <Link
                key={unit.id}
                href={`/listing/${unit.mlsId}`}
                className="flex items-center justify-between glass-card rounded-xl p-4 hover:shadow-md transition-all group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-semibold text-brand-dark">
                      {formatPrice(unit.listPrice)}
                    </span>
                    {unit.unit && (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-brand-dark/70 rounded-md">
                        Unit {unit.unit}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 text-sm text-brand-dark/70 mt-1">
                    <span>{unit.beds} bd</span>
                    <span>{unit.baths}{unit.bathsHalf > 0 ? `.${unit.bathsHalf}` : ''} ba</span>
                    {unit.sqft > 0 && <span>{unit.sqft.toLocaleString()} sf</span>}
                    {unit.propertyType && <span>{unit.propertyType}</span>}
                  </div>
                  <p className="text-[10px] text-brand-dark/40 mt-1">
                    RLS · {unit.office}
                  </p>
                </div>
                <svg className="w-4 h-4 text-brand-dark/30 group-hover:text-brand-gold transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))
          )}
        </div>
      )}

      {/* Sale History */}
      {!loading && tab === 'history' && (
        <div className="space-y-2">
          {saleHistory.length === 0 ? (
            <div className="glass-card rounded-2xl p-6 text-center">
              <p className="text-brand-dark/70">No recent sale history found for this building.</p>
              <p className="text-sm text-brand-dark/50 mt-1">
                For past transaction data, contact us at{' '}
                <a href="tel:646-258-4460" className="text-brand-gold-deep hover:underline">646-258-4460</a>
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-0.5 px-4 py-2 text-[11px] font-medium text-brand-dark/50 uppercase tracking-wider">
                <span>Unit</span>
                <span>Sale Price</span>
                <span>Size</span>
                <span>Date</span>
              </div>
              {saleHistory.map((sale) => (
                <div
                  key={sale.id}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center glass-card rounded-xl px-4 py-3"
                >
                  <div>
                    <span className="text-sm font-medium text-brand-dark">
                      {sale.unit ? `Unit ${sale.unit}` : 'Unit —'}
                    </span>
                    <span className="text-xs text-brand-dark/50 ml-2">
                      {sale.beds}bd/{sale.baths}ba
                    </span>
                  </div>
                  <span className="font-display font-semibold text-sm text-brand-dark">
                    {formatPrice(sale.closePrice)}
                  </span>
                  <span className="text-sm text-brand-dark/70">
                    {sale.sqft > 0 ? `${sale.sqft.toLocaleString()} sf` : '—'}
                  </span>
                  <span className="text-sm text-brand-dark/60">
                    {sale.closeDate ? new Date(sale.closeDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}
                  </span>
                </div>
              ))}
              {saleHistory.length > 0 && saleHistory[0].closePrice > 0 && saleHistory[0].sqft > 0 && (
                <p className="text-xs text-brand-dark/40 px-4 pt-2">
                  Last sold: {formatPrice(saleHistory[0].closePrice)}
                  {saleHistory[0].sqft > 0 && ` ($${Math.round(saleHistory[0].closePrice / saleHistory[0].sqft)}/sf)`}
                  {saleHistory[0].closeDate && ` on ${new Date(saleHistory[0].closeDate).toLocaleDateString()}`}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <p className="text-[9px] text-brand-dark/30 mt-3">
        REBNY RLS · Data deemed reliable but not guaranteed
      </p>
    </section>
  );
}
