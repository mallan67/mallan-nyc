/**
 * First-Party Signal Collector — Behavioral signals from mallan.nyc
 *
 * Tracks page visits, CMA requests, and valuation form submissions
 * to gauge seller interest. All first-party data — no third-party tracking.
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { SignalInput } from '../types';

/**
 * Record a first-party behavioral signal for an address.
 * Called from frontend event handlers (page visits, form submissions).
 */
export async function recordFirstPartySignal(
  address: string,
  unit: string | null,
  signalType: 'page_visit' | 'cma_request' | 'valuation_form',
  metadata?: Record<string, unknown>
): Promise<void> {
  // Find or create the seller lead
  const lead = await prisma.sellerLead.upsert({
    where: {
      address_unit: { address, unit: unit || '' },
    },
    create: {
      address,
      unit: unit || undefined,
    },
    update: {},
  });

  // Add the signal
  await prisma.readinessSignal.create({
    data: {
      seller_lead_id: lead.id,
      signal_type: signalType,
      raw_value: signalType,
      normalized: signalNormalizedValue(signalType),
      source: 'first_party',
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/**
 * Collect accumulated first-party signals for a seller lead.
 * Aggregates multiple page visits / interactions into normalized scores.
 */
export async function collectFirstPartySignals(sellerLeadId: bigint): Promise<SignalInput[]> {
  const signals: SignalInput[] = [];

  // Count recent first-party signals (last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const recentSignals = await prisma.readinessSignal.findMany({
    where: {
      seller_lead_id: sellerLeadId,
      source: 'first_party',
      collected_at: { gte: ninetyDaysAgo },
    },
  });

  // Aggregate by type
  const pageVisits = recentSignals.filter(s => s.signal_type === 'page_visit');
  const cmaRequests = recentSignals.filter(s => s.signal_type === 'cma_request');
  const valuationForms = recentSignals.filter(s => s.signal_type === 'valuation_form');

  if (pageVisits.length > 0) {
    // More visits = higher interest. Caps at 10 visits = 1.0
    signals.push({
      signal_type: 'page_visit',
      raw_value: `${pageVisits.length} visits (90d)`,
      normalized: Math.min(1.0, pageVisits.length / 10),
      source: 'first_party',
      metadata: { count: pageVisits.length },
    });
  }

  if (cmaRequests.length > 0) {
    // Any CMA request is strong signal. Multiple = very strong.
    signals.push({
      signal_type: 'cma_request',
      raw_value: `${cmaRequests.length} CMA requests`,
      normalized: Math.min(1.0, 0.7 + (cmaRequests.length - 1) * 0.15),
      source: 'first_party',
      metadata: { count: cmaRequests.length },
    });
  }

  if (valuationForms.length > 0) {
    // Valuation form submission is a moderate signal
    signals.push({
      signal_type: 'valuation_form',
      raw_value: `${valuationForms.length} submissions`,
      normalized: Math.min(1.0, 0.5 + (valuationForms.length - 1) * 0.25),
      source: 'first_party',
      metadata: { count: valuationForms.length },
    });
  }

  return signals;
}

/** Base normalized value for a one-time first-party signal */
function signalNormalizedValue(type: 'page_visit' | 'cma_request' | 'valuation_form'): number {
  switch (type) {
    case 'page_visit': return 0.1;
    case 'cma_request': return 0.7;
    case 'valuation_form': return 0.5;
  }
}
