'use client';

import { useState } from 'react';

interface PriceEvent {
  date: string;
  eventType: 'Listed' | 'Price Change' | 'Under Contract' | 'Sold';
  price: number;
  changeAmount: number | null;
  changePercent: number | null;
}

interface PriceHistoryProps {
  listPrice: number;
  originalListPrice: number;
  previousListPrice?: number;
  closePrice: number | null;
  status: string;
  onMarketDate?: string;
  listingContractDate: string;
  modificationTimestamp: string;
  closeDate?: string;
  listingType: 'sale' | 'rent';
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

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function buildTimeline(props: PriceHistoryProps): PriceEvent[] {
  const events: PriceEvent[] = [];

  const listedDate = props.onMarketDate || props.listingContractDate;
  const originalPrice = props.originalListPrice || props.listPrice;

  // 1. Listed event
  events.push({
    date: listedDate,
    eventType: 'Listed',
    price: originalPrice,
    changeAmount: null,
    changePercent: null,
  });

  // 2. Price change to previousListPrice (if different from original and current)
  if (
    props.previousListPrice &&
    props.previousListPrice !== originalPrice &&
    props.previousListPrice !== props.listPrice
  ) {
    const changeAmount = props.previousListPrice - originalPrice;
    const changePercent = (changeAmount / originalPrice) * 100;
    events.push({
      // Approximate date — we don't have the exact timestamp from Trestle
      date: props.modificationTimestamp,
      eventType: 'Price Change',
      price: props.previousListPrice,
      changeAmount,
      changePercent,
    });
  }

  // 3. Price change to current listPrice (if different from original/previous)
  if (props.listPrice !== originalPrice) {
    const referencePrice = props.previousListPrice && props.previousListPrice !== originalPrice
      ? props.previousListPrice
      : originalPrice;
    const changeAmount = props.listPrice - referencePrice;
    const changePercent = (changeAmount / referencePrice) * 100;

    // Only add if we haven't already added this as the previous price change
    if (props.listPrice !== props.previousListPrice) {
      events.push({
        date: props.modificationTimestamp,
        eventType: 'Price Change',
        price: props.listPrice,
        changeAmount,
        changePercent,
      });
    }
  }

  // 4. Under Contract
  if (
    props.status === 'ActiveUnderContract' ||
    props.status === 'Pending' ||
    props.status === 'Closed'
  ) {
    events.push({
      date: props.listingContractDate || props.modificationTimestamp,
      eventType: 'Under Contract',
      price: props.listPrice,
      changeAmount: null,
      changePercent: null,
    });
  }

  // 5. Sold
  if (props.status === 'Closed' && props.closePrice && props.closePrice > 0) {
    const changeAmount = props.closePrice - props.listPrice;
    const changePercent = (changeAmount / props.listPrice) * 100;
    events.push({
      date: props.closeDate || props.modificationTimestamp,
      eventType: 'Sold',
      price: props.closePrice,
      changeAmount,
      changePercent,
    });
  }

  return events;
}

export default function PriceHistory(props: PriceHistoryProps) {
  const [collapsed, setCollapsed] = useState(false);
  const events = buildTimeline(props);

  // Don't show if there's only one event (just "Listed" with no changes)
  if (events.length <= 1) {
    return null;
  }

  return (
    <section className="py-6 border-t border-black/[0.06]">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-[0.15em]">
          Price History
        </p>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-colors"
          aria-label={collapsed ? 'Expand price history' : 'Collapse price history'}
        >
          <svg
            className={`w-3.5 h-3.5 text-brand-dark/50 transition-transform ${collapsed ? '' : 'rotate-180'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="relative">
            {events.map((event, i) => {
              const isLast = i === events.length - 1;
              const isIncrease = event.changePercent !== null && event.changePercent > 0;
              const isDecrease = event.changePercent !== null && event.changePercent < 0;

              // Dot color based on event type
              let dotColor = 'bg-brand-dark';
              let dotBorder = 'border-brand-dark/20';
              if (event.eventType === 'Listed') {
                dotColor = 'bg-blue-500';
                dotBorder = 'border-blue-200';
              } else if (event.eventType === 'Price Change') {
                if (isDecrease) {
                  dotColor = 'bg-red-500';
                  dotBorder = 'border-red-200';
                } else {
                  dotColor = 'bg-[#C4A052]';
                  dotBorder = 'border-[#C4A052]/20';
                }
              } else if (event.eventType === 'Under Contract') {
                dotColor = 'bg-purple-500';
                dotBorder = 'border-purple-200';
              } else if (event.eventType === 'Sold') {
                dotColor = 'bg-green-500';
                dotBorder = 'border-green-200';
              }

              return (
                <div key={`${event.eventType}-${i}`} className="relative flex gap-4">
                  {/* Timeline line + dot */}
                  <div className="flex flex-col items-center flex-shrink-0" style={{ width: '24px' }}>
                    {/* Dot */}
                    <div className={`w-3 h-3 rounded-full ${dotColor} border-2 ${dotBorder} z-10 mt-1.5`} />
                    {/* Connecting line */}
                    {!isLast && (
                      <div className="w-px flex-1 bg-black/10 min-h-[24px]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className={`pb-5 flex-1 ${isLast ? 'pb-0' : ''}`}>
                    <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
                      {/* Event type badge */}
                      <span className={`inline-flex items-center text-[11px] font-semibold uppercase tracking-wider ${
                        event.eventType === 'Listed' ? 'text-blue-600' :
                        event.eventType === 'Under Contract' ? 'text-purple-600' :
                        event.eventType === 'Sold' ? 'text-green-600' :
                        isDecrease ? 'text-red-600' : 'text-[#C4A052]'
                      }`}>
                        {event.eventType}
                      </span>

                      {/* Date */}
                      <span className="text-[12px] text-brand-dark/40">
                        {formatDate(event.date)}
                      </span>
                    </div>

                    {/* Price */}
                    <p className="font-display font-bold text-[17px] text-brand-dark mt-1">
                      {formatPrice(event.price, props.listingType === 'rent')}
                    </p>

                    {/* Change amount + percentage */}
                    {event.changeAmount !== null && event.changePercent !== null && (
                      <p className={`text-[13px] mt-0.5 font-medium ${
                        isIncrease ? 'text-[#C4A052]' : 'text-red-600'
                      }`}>
                        {isIncrease ? '+' : ''}
                        {formatPrice(Math.abs(event.changeAmount), props.listingType === 'rent')}
                        {' '}
                        <span className="font-normal text-brand-dark/40">
                          ({isIncrease ? '+' : ''}{event.changePercent.toFixed(1)}%)
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* REBNY RLS attribution */}
          <p className="text-[10px] text-brand-dark/30 mt-4">
            Based on information from the REBNY Listing Service. Data deemed reliable but not guaranteed.
          </p>
        </>
      )}
    </section>
  );
}
