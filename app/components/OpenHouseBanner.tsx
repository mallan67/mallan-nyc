import type { NextOpenHouse } from '@/lib/open-houses/upcoming-open-houses';

/**
 * Shared open-house banner for listing cards (homepage Featured, agent page, search/Mallan-listings,
 * and reusable elsewhere). Renders e.g. "Open House · Sun 12:00 PM – 1:00 PM" using the Eastern
 * times the API already formatted. Returns null when there is no upcoming public open house, so it is
 * safe to drop into any card unconditionally. It is a SEPARATE element from the "Mallan Exclusive"
 * gold badge — both can show at once.
 */
export default function OpenHouseBanner({
  openHouse,
  className = '',
}: {
  openHouse: NextOpenHouse | null | undefined;
  className?: string;
}) {
  if (!openHouse || !openHouse.date || !openHouse.startTime) return null;

  // Weekday from the calendar date. Parse at noon so the day never shifts across a timezone boundary.
  let day = '';
  try {
    day = new Date(`${openHouse.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
  } catch {
    day = '';
  }
  const time = openHouse.endTime
    ? `${openHouse.startTime} – ${openHouse.endTime}`
    : openHouse.startTime;
  const label = `Open House${day ? ` · ${day}` : ''} ${time}`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-brand-gold px-2 py-1 text-[11px] font-semibold text-white shadow-sm ${className}`}
      title={label}
    >
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      </svg>
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}
