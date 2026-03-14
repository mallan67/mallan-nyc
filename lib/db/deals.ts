import prisma from "@/lib/prisma";
import { serializeBigInts } from "@/lib/api/serialize";

const DEAL_INCLUDE = {
  agent: {
    select: { id: true, full_name: true, email: true },
  },
} as const;

/**
 * Find deals with ownership enforcement and pagination.
 * Broker sees all; agents see only their own.
 */
export async function findDeals(opts: {
  userId: bigint;
  role: string;
  status?: string | null;
  limit?: number;
  offset?: number;
}) {
  const { userId, role, status, limit = 50, offset = 0 } = opts;
  const where: Record<string, unknown> = {};

  if (role !== "BROKER") {
    where.agent_id = userId;
  }
  if (status) where.status = status;

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: { updated_at: "desc" },
      take: Math.min(limit, 200),
      skip: offset,
      include: DEAL_INCLUDE,
    }),
    prisma.deal.count({ where }),
  ]);

  return {
    deals: deals.map(serializeBigInts),
    total,
    limit,
    offset,
  };
}

/**
 * Find a single deal by ID. Returns serialized deal or null.
 */
export async function findDealById(id: string) {
  const numericId = parseInt(id);
  if (isNaN(numericId)) return null;

  const deal = await prisma.deal.findUnique({
    where: { id: BigInt(numericId) },
    include: DEAL_INCLUDE,
  });

  return deal ? serializeBigInts(deal) : null;
}

/**
 * Create a deal. Returns serialized result.
 */
export async function createDeal(data: {
  agent_id: bigint;
  representation_code?: string | null;
  property_address?: string | null;
  price_usd?: number | null;
  commission_rate_percent?: number | null;
  split_percent?: number | null;
  agent_fee_usd?: number | null;
  company_fee_usd?: number | null;
  gross_commission_usd?: number | null;
  contract_signed?: Date | null;
}) {
  const deal = await prisma.deal.create({
    data: {
      ...data,
      status: "submitted",
    },
  });
  return serializeBigInts(deal);
}

/**
 * Update a deal. Returns serialized result.
 */
export async function updateDeal(
  id: bigint,
  data: Record<string, unknown>
) {
  const updated = await prisma.deal.update({
    where: { id },
    data,
  });
  return serializeBigInts(updated);
}
