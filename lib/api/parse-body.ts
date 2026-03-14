import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns { data } on success or { error: NextResponse } on failure.
 */
export async function parseBody<T extends z.ZodType>(
  req: NextRequest,
  schema: T
): Promise<
  | { data: z.infer<T>; error?: never }
  | { data?: never; error: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      error: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `${i.path.length ? i.path.join(".") : "value"}: ${i.message}`
    );
    return {
      error: NextResponse.json(
        { error: "Validation failed", details: issues },
        { status: 400 }
      ),
    };
  }

  return { data: result.data };
}
