import { NextResponse } from "next/server";
export const runtime = "nodejs"; // explicit

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/ping2" });
}
