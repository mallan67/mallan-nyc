/**
 * Agent Performance Calculator — computes monthly metrics from CRM data
 */

import prisma from '@/lib/prisma';
import { BENCHMARKS } from './config';
import type { MonthlyMetrics } from './types';

/**
 * Compute metrics for a single agent for a given month.
 */
export async function computeMonthlyMetrics(
  agentId: bigint,
  month: Date
): Promise<MonthlyMetrics> {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const monthStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;

  // Deals closed this month (contract_closed is the close date)
  const deals = await prisma.deal.findMany({
    where: {
      agent_id: agentId,
      contract_closed: { gte: start, lt: end },
    },
    select: {
      contract_signed: true,
      contract_closed: true,
    },
  });

  const dealsClosed = deals.length;

  // Closing cadence (contract signed → closed avg days)
  let closingCadenceDays: number | null = null;
  const cadences = deals
    .filter(d => d.contract_signed && d.contract_closed)
    .map(d => (d.contract_closed!.getTime() - d.contract_signed!.getTime()) / (24 * 60 * 60 * 1000));
  if (cadences.length > 0) {
    closingCadenceDays = Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length);
  }

  // Showings conducted (field is `date`)
  const showingsConducted = await prisma.showing.count({
    where: {
      agent_id: agentId,
      date: { gte: start, lt: end },
    },
  });

  // Leads contacted — proxy: leads whose status changed from 'new' to 'contacted' or beyond
  // Since Lead has no first_contact_at, use leads created in this period with status !== 'new'
  const leadsContacted = await prisma.lead.count({
    where: {
      agent_id: agentId,
      created_at: { gte: start, lt: end },
      status: { not: 'new' },
    },
  });

  // Time to contact — approximate from lead created_at to updated_at for non-new leads
  const contactedLeads = await prisma.lead.findMany({
    where: {
      agent_id: agentId,
      created_at: { gte: start, lt: end },
      status: { not: 'new' },
    },
    select: {
      created_at: true,
      updated_at: true,
    },
  });

  let timeToContactAvg: number | null = null;
  const contactTimes = contactedLeads
    .map(l => (l.updated_at.getTime() - l.created_at.getTime()) / (60 * 60 * 1000))
    .filter(h => h > 0 && h < BENCHMARKS.time_to_contact_worst_hours * 2);
  if (contactTimes.length > 0) {
    timeToContactAvg = Math.round(contactTimes.reduce((a, b) => a + b, 0) / contactTimes.length * 10) / 10;
  }

  // Showings to offer ratio
  let showingsToOfferRatio: number | null = null;
  if (showingsConducted > 0) {
    const offersFromShowings = await prisma.deal.count({
      where: {
        agent_id: agentId,
        created_at: { gte: start, lt: end },
      },
    });
    showingsToOfferRatio = Math.round((offersFromShowings / showingsConducted) * 100) / 100;
  }

  // Compliance score from audit events (count violations vs total)
  // user_id is BigInt? — pass as BigInt
  const totalAudits = await prisma.auditEvent.count({
    where: {
      user_id: agentId,
      created_at: { gte: start, lt: end },
    },
  });
  const violations = await prisma.auditEvent.count({
    where: {
      user_id: agentId,
      created_at: { gte: start, lt: end },
      action: { contains: 'violation' },
    },
  });
  const complianceScore = totalAudits > 0
    ? Math.round(((totalAudits - violations) / totalAudits) * 100)
    : 100;

  // Response rate (contacted leads / total leads assigned in period)
  const totalLeadsAssigned = await prisma.lead.count({
    where: {
      agent_id: agentId,
      created_at: { gte: start, lt: end },
    },
  });
  const responseRate = totalLeadsAssigned > 0
    ? Math.round((leadsContacted / totalLeadsAssigned) * 100)
    : 100;

  return {
    month: monthStr,
    time_to_contact_avg: timeToContactAvg,
    showings_to_offer_ratio: showingsToOfferRatio,
    closing_cadence_days: closingCadenceDays,
    compliance_score: complianceScore,
    response_rate: responseRate,
    deal_volume: dealsClosed,
    client_satisfaction: null,
    deals_closed: dealsClosed,
    showings_conducted: showingsConducted,
    leads_contacted: leadsContacted,
  };
}

/**
 * Normalize a raw metric value to a 0-100 score (higher = better).
 */
export function normalizeMetric(type: string, value: number | null): number {
  if (value === null) return 50; // neutral default

  switch (type) {
    case 'time_to_contact': {
      // Lower is better: 1hr=100, 48hr=0
      const clamped = Math.max(BENCHMARKS.time_to_contact_ideal_hours, Math.min(value, BENCHMARKS.time_to_contact_worst_hours));
      return Math.round(100 * (1 - (clamped - BENCHMARKS.time_to_contact_ideal_hours) / (BENCHMARKS.time_to_contact_worst_hours - BENCHMARKS.time_to_contact_ideal_hours)));
    }
    case 'conversion': {
      // Higher ratio is better: 0.5=100, 0=0
      return Math.round(Math.min(100, (value / BENCHMARKS.showings_to_offer_ideal) * 100));
    }
    case 'closing_speed': {
      // Lower is better: 30d=100, 120d=0
      const clamped = Math.max(BENCHMARKS.closing_cadence_ideal_days, Math.min(value, BENCHMARKS.closing_cadence_worst_days));
      return Math.round(100 * (1 - (clamped - BENCHMARKS.closing_cadence_ideal_days) / (BENCHMARKS.closing_cadence_worst_days - BENCHMARKS.closing_cadence_ideal_days)));
    }
    case 'volume': {
      return Math.round(Math.min(100, (value / BENCHMARKS.deal_volume_benchmark) * 100));
    }
    default:
      return Math.round(Math.min(100, value));
  }
}
