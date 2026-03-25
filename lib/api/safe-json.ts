import { NextRequest, NextResponse } from "next/server";

/**
 * Safely parse JSON from request body.
 * Returns [data, null] on success, [null, errorResponse] on parse error.
 *
 * Usage:
 *   const [body, err] = await safeJson(req);
 *   if (err) return err;
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safeJson<T = any>(
  req: NextRequest
): Promise<[T, null] | [null, NextResponse]> {
  try {
    const data = (await req.json()) as T;
    return [data, null];
  } catch {
    return [
      null,
      NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    ];
  }
}
