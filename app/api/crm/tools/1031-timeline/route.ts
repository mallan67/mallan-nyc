// GET /api/crm/tools/1031-timeline — 1031 exchange deadline tracking
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const sale_close_date = url.searchParams.get("sale_close_date");

  if (!sale_close_date) {
    return NextResponse.json({ error: "sale_close_date required" }, { status: 400 });
  }

  const closeDate = new Date(sale_close_date);
  const now = new Date();

  // 45-day identification deadline
  const id_deadline = new Date(closeDate.getTime() + 45 * 86400000);
  // 180-day exchange deadline
  const exchange_deadline = new Date(closeDate.getTime() + 180 * 86400000);

  const days_since_close = Math.floor((now.getTime() - closeDate.getTime()) / 86400000);
  const days_to_identification = Math.max(0, Math.floor((id_deadline.getTime() - now.getTime()) / 86400000));
  const days_to_exchange = Math.max(0, Math.floor((exchange_deadline.getTime() - now.getTime()) / 86400000));

  let id_status = "on_track";
  if (days_to_identification <= 0) id_status = "overdue";
  else if (days_to_identification <= 7) id_status = "urgent";
  else if (days_to_identification <= 14) id_status = "approaching";

  let exchange_status = "on_track";
  if (days_to_exchange <= 0) exchange_status = "overdue";
  else if (days_to_exchange <= 14) exchange_status = "urgent";
  else if (days_to_exchange <= 30) exchange_status = "approaching";

  return NextResponse.json({
    sale_close_date: closeDate.toISOString(),
    identification_deadline: id_deadline.toISOString(),
    exchange_deadline: exchange_deadline.toISOString(),
    days_since_close,
    days_to_identification,
    days_to_exchange,
    identification_status: id_status,
    exchange_status,
    progress_percent: Math.min(100, Math.round((days_since_close / 180) * 100)),
  });
}
