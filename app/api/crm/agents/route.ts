import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const mod: any = await import("@prisma/client");
    const PrismaClient = mod?.PrismaClient;
    if (PrismaClient) {
      const prisma = new PrismaClient();
      const agents = await prisma.agent.findMany({
        select: {
          first_name: true,
          last_name: true,
          full_name: true,
          email: true,
          license_no: true,
          license_expiry: true,
          sale_split: true,
          rental_split: true,
          role: true,
        },
        orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
      });
      return NextResponse.json(agents);
    }
  } catch (_) { /* fall through */ }

  const { q } = await import("@/lib/db");
  const rows = await q(`
    SELECT first_name, last_name, full_name, email, license_no, license_expiry,
           sale_split, rental_split, role
    FROM agents
    ORDER BY last_name, first_name
  `);
  return NextResponse.json(rows);
}
