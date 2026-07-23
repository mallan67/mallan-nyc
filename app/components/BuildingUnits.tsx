'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { isComingSoonStatus } from './ComingSoonBadge';
import { toRecordedTransfers, type RecordedTransferView } from '@/lib/buildings/recorded-transfers';

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
  /** Listing status as returned by /api/listings/building. Defaults to "Active"
      since the endpoint only returns active units, but this lets us label
      ComingSoon / ActiveUnderContract / Pending correctly when present. */
  status?: string | null;
  comingSoonDate?: string | null;
  activationDate?: string | null;
}

const STATUS_LABEL_MAP: Record<string, { label: string; color: string }> = {
  Active: { label: 'Active', color: 'text-blue-600' },
  ActiveUnderContract: { label: 'In Contract', color: 'text-amber-600' },
  Pending: { label: 'Pending', color: 'text-amber-600' },
  Closed: { label: 'Closed', color: 'text-gray-500' },
  Withdrawn: { label: 'Withdrawn', color: 'text-gray-500' },
  Canceled: { label: 'Cancelled', color: 'text-gray-500' },
  Cancelled: { label: 'Cancelled', color: 'text-gray-500' },
  Expired: { label: 'Expired', color: 'text-gray-500' },
  Hold: { label: 'On Hold', color: 'text-gray-500' },
};

function labelForStatus(raw: string | null | undefined): { label: string; color: string } {
  const status = String(raw || 'Active').replace(/\s+/g, '');
  return STATUS_LABEL_MAP[status] || { label: status, color: 'text-gray-600' };
}

// Transfers use the CANONICAL RecordedTransferView from
// lib/buildings/recorded-transfers (recordedTransfers field; saleHistory is
// only the DEPRECATED compatibility alias resolved inside the helper).

interface BuildingUnitsProps {
  streetNumber: string;
  streetName: string;
  postalCode: string;
  currentListingId: string;
  buildingName?: string;
  currentUnit?: string;
}

function formatPrice(price: number): string {
  return `$${price.toLocaleString()}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

const INITIAL_ROWS = 3;

export default function BuildingUnits({
  streetNumber,
  streetName,
  postalCode,
  currentListingId,
  buildingName,
  currentUnit,
}: BuildingUnitsProps) {
  const [activeUnits, setActiveUnits] = useState<ActiveUnit[]>([]);
  const [transfers, setTransfers] = useState<RecordedTransferView[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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
        setTransfers(toRecordedTransfers(data));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [streetNumber, streetName, postalCode, currentListingId]);

  if (!loading && activeUnits.length === 0 && transfers.length === 0) return null;

  const buildingLabel = buildingName || `${streetNumber} ${streetName}`;
  const unitHistoryForCurrent = currentUnit
    ? transfers.filter((s) => s.unit && s.unit.toLowerCase() === currentUnit.toLowerCase())
    : [];
  const visibleHistory = expanded ? transfers : transfers.slice(0, INITIAL_ROWS);
  const hasMoreRows = transfers.length > INITIAL_ROWS;

  // Determine which columns have actual data (hide empty columns from ACRIS-only results)
  const hasUnitData = transfers.some((s) => s.unit && s.unit.length > 0);
  const hasDetailData = transfers.some((s) => !!s.sqft || !!s.beds || !!s.baths);

  return (
    <section>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-[0.15em]">
          Building Recorded Transfers
        </p>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-colors"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg className={`w-3.5 h-3.5 text-brand-dark/50 transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
      </div>

      {!collapsed && (
        <>
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-50 rounded animate-pulse" />
              ))}
            </div>
          )}

          {!loading && (
            <div className={`grid gap-8 lg:gap-12 ${
              (currentUnit && unitHistoryForCurrent.length > 0) || activeUnits.length > 0
                ? 'grid-cols-1 lg:grid-cols-2'
                : 'grid-cols-1'
            }`}>
              {/* ── LEFT: Building-wide recorded transfers (NYC ACRIS) ── */}
              <div>
                <h3 className="font-display text-lg font-semibold text-brand-dark mb-4 leading-snug">
                  Recorded Transfers for {buildingLabel}
                </h3>
                <p className="text-[12px] text-brand-dark/60 mb-3">NYC ACRIS public records — recorded transfer documents, not verified unit-level sales. Source: NYC ACRIS.</p>

                {transfers.length === 0 ? (
                  <p className="text-sm text-brand-dark/50">No recorded transfers found for this building.</p>
                ) : (
                  <>
                    {/* Table header — hide columns that have no data */}
                    <div className={`grid gap-x-3 pb-2 border-b border-black/10 ${
                      hasDetailData
                        ? 'grid-cols-[90px_50px_90px_80px_40px_40px]'
                        : hasUnitData
                          ? 'grid-cols-[100px_60px_1fr]'
                          : 'grid-cols-[100px_1fr]'
                    }`}>
                      <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Date</span>
                      {hasUnitData && <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Unit</span>}
                      <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Recorded Amount</span>
                      {hasDetailData && (
                        <>
                          <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Sq. Ft.</span>
                          <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Beds</span>
                          <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Baths</span>
                        </>
                      )}
                    </div>

                    {/* Rows */}
                    {visibleHistory.map((sale) => (
                      <div
                        key={sale.id}
                        className={`grid gap-x-3 py-3 border-b border-black/5 items-center ${
                          hasDetailData
                            ? 'grid-cols-[90px_50px_90px_80px_40px_40px]'
                            : hasUnitData
                              ? 'grid-cols-[100px_60px_1fr]'
                              : 'grid-cols-[100px_1fr]'
                        }`}
                      >
                        <span className="text-[13px] text-brand-dark/70">
                          {formatDate(sale.recordedDate)}
                          {sale.source === 'acris' && (
                            <span className="block text-[9px] text-brand-dark/30 leading-tight">ACRIS</span>
                          )}
                        </span>
                        {hasUnitData && <span className="text-[13px] font-medium text-brand-gold-deep">{sale.unit || '\u2014'}</span>}
                        <span className="text-[13px] text-brand-dark">{sale.amount != null ? formatPrice(sale.amount) : '—'}</span>
                        {hasDetailData && (
                          <>
                            <span className="text-[13px] text-brand-dark/70">{sale.sqft ? sale.sqft.toLocaleString() : '\u2014'}</span>
                            <span className="text-[13px] text-brand-dark/70">{sale.beds ? sale.beds : '\u2014'}</span>
                            <span className="text-[13px] text-brand-dark/70">{sale.baths ? sale.baths : '\u2014'}</span>
                          </>
                        )}
                      </div>
                    ))}

                    {/* See more / less */}
                    {hasMoreRows && (
                      <button
                        onClick={() => setExpanded(!expanded)}
                        className="mt-3 text-[12px] font-semibold text-brand-gold-deep uppercase tracking-wider hover:text-brand-gold transition-colors flex items-center gap-1.5"
                      >
                        {expanded ? (
                          <>Show Less <span className="text-sm">&minus;</span></>
                        ) : (
                          <>See {transfers.length - INITIAL_ROWS} More Rows <span className="text-sm">+</span></>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* ── RIGHT: Unit-specific history OR active units ── */}
              <div>
                {currentUnit && unitHistoryForCurrent.length > 0 ? (
                  <>
                    <h3 className="font-display text-lg font-semibold text-brand-dark mb-1 leading-snug">
                      Recorded Transfers for {streetNumber} {streetName}, {currentUnit}
                    </h3>
                    <div className="w-8 h-0.5 bg-brand-dark mb-4" />

                    {/* Table header */}
                    <div className="grid grid-cols-[100px_100px_1fr] gap-x-4 pb-2 border-b border-black/10">
                      <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Date</span>
                      <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Recorded Amount</span>
                      <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Listing Status</span>
                    </div>

                    {unitHistoryForCurrent.map((sale) => (
                      <div
                        key={sale.id}
                        className="grid grid-cols-[100px_100px_1fr] gap-x-4 py-3 border-b border-black/5 items-center"
                      >
                        <span className="text-[13px] text-brand-dark/70">{formatDate(sale.recordedDate)}</span>
                        <span className="text-[13px] text-brand-dark">{sale.amount != null ? formatPrice(sale.amount) : '—'}</span>
                        <span className="text-[13px] text-brand-dark/70">Recorded</span>
                      </div>
                    ))}
                  </>
                ) : activeUnits.length > 0 ? (
                  <>
                    <h3 className="font-display text-lg font-semibold text-brand-dark mb-1 leading-snug">
                      Available Units in {buildingLabel}
                    </h3>
                    <div className="w-8 h-0.5 bg-brand-dark mb-4" />

                    {/* Table header */}
                    <div className="grid grid-cols-[50px_90px_40px_40px_70px] gap-x-3 pb-2 border-b border-black/10">
                      <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Unit</span>
                      <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Asking Price</span>
                      <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Beds</span>
                      <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Baths</span>
                      <span className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">Status</span>
                    </div>

                    {activeUnits.map((unit) => {
                      const isCS = isComingSoonStatus(unit.status);
                      const csDate = unit.comingSoonDate || unit.activationDate;
                      return (
                        <Link
                          key={unit.id}
                          href={`/listing/${unit.mlsId}`}
                          className="grid grid-cols-[50px_90px_40px_40px_70px] gap-x-3 py-3 border-b border-black/5 items-center hover:bg-black/[0.02] transition-colors"
                          title={isCS && csDate ? `Coming Soon. No Showings or Open House until ${new Date(csDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : undefined}
                        >
                          <span className="text-[13px] font-medium text-brand-gold-deep">{unit.unit || '\u2014'}</span>
                          <span className="text-[13px] text-brand-dark">{formatPrice(unit.listPrice)}</span>
                          <span className="text-[13px] text-brand-dark/70">{unit.beds}</span>
                          <span className="text-[13px] text-brand-dark/70">{unit.baths}{unit.bathsHalf > 0 ? `.${unit.bathsHalf}` : ''}</span>
                          {/* Status cell \u2014 UCBA Art. I \u00a716(C) Coming Soon takes precedence
                              (full required wording renders below the table). For all other
                              statuses, surface the actual status label so the cell never
                              mislabels Pending / Closed / Withdrawn as "Active". */}
                          {isCS ? (
                            <span className="text-[13px] text-blue-700 font-semibold">Coming Soon</span>
                          ) : (() => {
                            const { label, color } = labelForStatus(unit.status);
                            return <span className={`text-[13px] ${color}`}>{label}</span>;
                          })()}
                        </Link>
                      );
                    })}
                    {/* Per-row Coming Soon badge text (for any CS unit, render full UCBA wording below table) */}
                    {activeUnits.some((u) => isComingSoonStatus(u.status)) && (
                      <p className="text-sm text-blue-700 mt-2 font-medium" data-rebny-coming-soon>
                        {activeUnits
                          .filter((u) => isComingSoonStatus(u.status))
                          .map((u) => {
                            const d = u.comingSoonDate || u.activationDate;
                            const f = d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;
                            return `Unit ${u.unit || u.mlsId}: Coming Soon. No Showings or Open House${f ? ` until ${f}` : ' Permitted'}`;
                          })
                          .join(' \u00b7 ')}
                      </p>
                    )}

                    {/* REBNY attribution — UCBA Art. III §2(C): font not smaller than median (table body=13px) */}
                    <p className="text-[13px] text-brand-dark/75 mt-2">
                      {activeUnits.map((u) => `RLS · Listing Courtesy of ${u.office || 'REBNY RLS'}`).filter((v, i, a) => a.indexOf(v) === i).join(' | ')}
                    </p>
                  </>
                ) : null}
              </div>
            </div>
          )}

          <p className="text-[10px] text-brand-dark/30 mt-4">
            REBNY RLS &amp; NYC ACRIS Public Records &middot; Data deemed reliable but not guaranteed
          </p>
        </>
      )}
    </section>
  );
}
