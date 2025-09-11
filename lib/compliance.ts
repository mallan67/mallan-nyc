const RULES = [
  /\bno\s*children\b/i,
  /\bchristian\b/i,
  /\bwhites?\s*only\b/i,
  /\bable[-\s]?bodied\b/i,
  /\bno\s*(?:section\s*8|vouchers?)\b/i,
];

export function evaluateText(input: string) {
  const text = String(input || "");
  const hits = RULES.filter(rx => rx.test(text)).map(rx => rx.source);
  return { ok: hits.length === 0, hits };
}
