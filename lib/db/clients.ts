import prisma from "@/lib/prisma";
import { serializeBigInts } from "@/lib/api/serialize";

const CLIENT_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  email: true,
  phone: true,
  roles: true,
  status: true,
  portal_role: true,
  agent_id: true,
  source: true,
  notes: true,
  annual_income: true,
  bonuses: true,
  credit_score_range: true,
  pre_approved: true,
  pre_approved_amount: true,
  down_payment: true,
  available_funds: true,
  monthly_debt: true,
  employer: true,
  work_title: true,
  lease_start_date: true,
  lease_end_date: true,
  rent_per_month: true,
  rental_deposit: true,
  total_monthly_expense: true,
  pipeline_stage: true,
  created_at: true,
  updated_at: true,
} as const;

/**
 * Find clients with ownership enforcement and pagination.
 * Broker sees all; agents see only their assigned clients.
 */
export async function findClients(opts: {
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

  const [clients, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { updated_at: "desc" },
      take: Math.min(limit, 200),
      skip: offset,
      select: CLIENT_SELECT,
    }),
    prisma.lead.count({ where }),
  ]);

  return {
    clients: clients.map(serializeBigInts),
    total,
    limit,
    offset,
  };
}

/**
 * Check if email already exists.
 */
export async function clientEmailExists(email: string): Promise<boolean> {
  const existing = await prisma.lead.findUnique({
    where: { email: email.toLowerCase() },
  });
  return !!existing;
}

/**
 * Create a client. Returns serialized result.
 */
export async function createClient(data: {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  roles?: string[];
  portal_role?: string | null;
  agent_id: bigint;
  source?: string;
}) {
  const client = await prisma.lead.create({
    data: {
      ...data,
      email: data.email.toLowerCase(),
      roles: data.roles ?? [],
      status: "new",
      source: data.source ?? "manual",
    },
  });
  return serializeBigInts(client);
}
