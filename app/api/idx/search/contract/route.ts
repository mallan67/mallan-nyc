// GET /api/idx/search/contract
// The Search executor's executable parameters and vocabularies for browser consumers.
// Agent or broker session required. Read-only. Zero logic: the payload is the canonical
// source (lib/search/engine/contract.ts) verbatim.

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { searchContract } from "@/lib/search/engine/contract";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  return NextResponse.json(searchContract(), { headers: { "Cache-Control": "private, no-store" } });
}
