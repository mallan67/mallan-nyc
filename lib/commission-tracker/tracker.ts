/**
 * Commission Tracker — track payments through deal lifecycle
 */

import prisma from '@/lib/prisma';

export const PAYMENT_TYPES = [
  'received', 'agent_split', 'company_split', 'referral', 'adjustment',
] as const;

export const PAYMENT_STATUSES = [
  'pending', 'received', 'paid', 'void',
] as const;

export interface CommissionSummary {
  deal_id: string;
  property_address: string | null;
  gross_commission: number | null;
  agent_split_pct: number | null;
  total_received: number;
  total_agent_paid: number;
  total_company_paid: number;
  balance_due: number;
  payments: PaymentItem[];
}

interface PaymentItem {
  id: string;
  payment_type: string;
  amount: number;
  date: string | null;
  status: string;
  reference: string | null;
}

/**
 * Get commission summary for a deal.
 */
export async function getDealCommission(dealId: bigint): Promise<CommissionSummary> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      commission_payments: {
        orderBy: { created_at: 'desc' },
      },
    },
  });

  if (!deal) throw new Error('Deal not found');

  const payments: PaymentItem[] = deal.commission_payments.map(p => ({
    id: p.id.toString(),
    payment_type: p.payment_type,
    amount: Number(p.amount),
    date: p.date?.toISOString() ?? null,
    status: p.status,
    reference: p.reference,
  }));

  const totalReceived = payments
    .filter(p => p.payment_type === 'received' && p.status === 'received')
    .reduce((s, p) => s + p.amount, 0);

  const totalAgentPaid = payments
    .filter(p => p.payment_type === 'agent_split' && p.status === 'paid')
    .reduce((s, p) => s + p.amount, 0);

  const totalCompanyPaid = payments
    .filter(p => p.payment_type === 'company_split' && p.status === 'paid')
    .reduce((s, p) => s + p.amount, 0);

  const grossCommission = deal.gross_commission_usd ? Number(deal.gross_commission_usd) : null;
  const balanceDue = (grossCommission ?? 0) - totalReceived;

  return {
    deal_id: deal.id.toString(),
    property_address: deal.property_address,
    gross_commission: grossCommission,
    agent_split_pct: deal.split_percent ? Number(deal.split_percent) : null,
    total_received: totalReceived,
    total_agent_paid: totalAgentPaid,
    total_company_paid: totalCompanyPaid,
    balance_due: Math.max(0, balanceDue),
    payments,
  };
}

/**
 * Get P&L summary for an agent over a period.
 */
export async function getAgentPnL(agentId: bigint, startDate?: Date, endDate?: Date) {
  const where: Record<string, unknown> = { agent_id: agentId };
  if (startDate || endDate) {
    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lt = endDate;
    where.contract_closed = dateFilter;
  }

  const deals = await prisma.deal.findMany({
    where,
    include: {
      commission_payments: true,
    },
    orderBy: { contract_closed: 'desc' },
  });

  let totalGross = 0;
  let totalAgentEarned = 0;
  let totalCompanyEarned = 0;
  let pendingReceivables = 0;

  const dealSummaries = deals.map(d => {
    const gross = d.gross_commission_usd ? Number(d.gross_commission_usd) : 0;
    const agentFee = d.agent_fee_usd ? Number(d.agent_fee_usd) : 0;
    const companyFee = d.company_fee_usd ? Number(d.company_fee_usd) : 0;
    const received = d.commission_payments
      .filter(p => p.payment_type === 'received' && p.status === 'received')
      .reduce((s, p) => s + Number(p.amount), 0);

    totalGross += gross;
    totalAgentEarned += agentFee;
    totalCompanyEarned += companyFee;
    pendingReceivables += Math.max(0, gross - received);

    return {
      deal_id: d.id.toString(),
      property_address: d.property_address,
      status: d.status,
      gross_commission: gross,
      agent_fee: agentFee,
      company_fee: companyFee,
      received,
      balance: Math.max(0, gross - received),
    };
  });

  return {
    agent_id: agentId.toString(),
    period: {
      start: startDate?.toISOString() ?? null,
      end: endDate?.toISOString() ?? null,
    },
    total_deals: deals.length,
    total_gross: totalGross,
    total_agent_earned: totalAgentEarned,
    total_company_earned: totalCompanyEarned,
    pending_receivables: pendingReceivables,
    deals: dealSummaries,
  };
}
