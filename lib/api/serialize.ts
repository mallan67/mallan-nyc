/**
 * Recursive BigInt → string serializer for API responses.
 * Prisma returns BigInt for int8/bigint columns; JSON.stringify() throws on BigInt.
 * Use this instead of manual .toString() on every field.
 */
export function serializeBigInts<T>(obj: T): T {
  return _serialize(obj, new WeakSet());
}

function _serialize<T>(obj: T, seen: WeakSet<object>): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return obj.toString() as unknown as T;
  if (obj instanceof Date) return obj as T;
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
