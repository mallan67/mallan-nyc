/**
 * Recursive BigInt/Decimal → JSON-safe serializer for API responses.
 * Prisma returns BigInt for int8/bigint columns and Decimal for decimal columns;
 * JSON.stringify() throws on BigInt and Decimal serializes as { s, e, d }.
 */
export function serializeBigInts<T>(obj: T): T {
  return _serialize(obj, new WeakSet());
}

/** Detect Prisma Decimal objects (duck-typed: has s, e, d fields and toNumber()) */
function isDecimal(obj: unknown): obj is { toNumber(): number; toString(): string } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "d" in obj &&
    "e" in obj &&
    "s" in obj &&
    typeof (obj as Record<string, unknown>).toNumber === "function"
  );
}

function _serialize<T>(obj: T, seen: WeakSet<object>): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return obj.toString() as unknown as T;
  if (obj instanceof Date) return obj as T;
  if (isDecimal(obj)) return obj.toNumber() as unknown as T;
  if (Array.isArray(obj)) return obj.map((item) => _serialize(item, seen)) as unknown as T;
  if (typeof obj === "object") {
    if (seen.has(obj as object)) return "[Circular]" as unknown as T;
    seen.add(obj as object);
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = _serialize(value, seen);
    }
    return result as T;
  }
  return obj;
}
