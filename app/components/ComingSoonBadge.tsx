// REBNY UCBA Art. I §16(C) Coming Soon badge.
//
// Required exact phrasing: "Coming Soon. No Showings or Open House until [date]"
// (or "...Permitted" if no first-showing date is known).
//
// Penalty for omission: $500 → $2,000 → $10,000 → 30-day suspension.

export function isComingSoonStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = String(status).toLowerCase().replace(/\s+/g, '');
  return s === 'comingsoon';
}

// RESO date-only fields arrive as "YYYY-MM-DD". `new Date("2026-05-01")` parses
// as UTC midnight, so toLocaleDateString shifts to the prior calendar day in
// US timezones west of UTC — that misstates the compliance-facing "until [date]"
// copy. Construct in local time when the input is date-only; trust JS for full
// ISO timestamps (those carry their own offset). Exported for test coverage.
export function parseRESODateLocal(input: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(input);
}

interface ComingSoonBadgeProps {
  status?: string | null;
  comingSoonDate?: string | null;
  activationDate?: string | null;
  /** Tailwind class names for outer wrapper. */
  className?: string;
}

/**
 * Render the REBNY UCBA Art. I §16(C) Coming Soon badge if the listing is
 * Coming Soon. Returns null otherwise. Date precedence: comingSoonDate >
 * activationDate (per RLS spec, ActivationDate = Start Showing Date).
 */
export function ComingSoonBadge({
  status,
  comingSoonDate,
  activationDate,
  className = '',
}: ComingSoonBadgeProps) {
  if (!isComingSoonStatus(status)) return null;
  const csDate = comingSoonDate || activationDate;
  const formatted = csDate
    ? parseRESODateLocal(csDate).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;
  const text = formatted
    ? `Coming Soon. No Showings or Open House until ${formatted}`
    : 'Coming Soon. No Showings or Open House Permitted';
  return (
    <span
      className={
        className ||
        'inline-block bg-blue-600 text-white text-[12px] font-semibold px-2.5 py-1 rounded leading-tight'
      }
      data-rebny-coming-soon
    >
      {text}
    </span>
  );
}
