// FARE Act (NYC Local Law 119/2024) — rental listings must disclose broker fee
// responsibility WHEREVER fees are advertised, not only on the detail page. This
// tiny badge surfaces the disclosure on search cards, rent page, and featured
// listings so we don't accumulate DCWP complaints for display-layer gaps.
//
// Semantics:
//   - If tenantPaysDescription mentions a broker fee → "Tenant pays broker fee"
//   - If moveInCosts includes "No Fee" / "No Broker Fee" → "No broker fee"
//   - Otherwise fall back to a neutral pointer to the detail page
//   - Mandatory text is sourced from DCWP FARE Act FAQ.

export interface FareActFeeBadgeProps {
  moveInCosts?: string;
  tenantPaysDescription?: string;
  /** Display variant — compact for cards, full for detail pages */
  variant?: 'compact' | 'full';
  className?: string;
}

function classifyFee(moveInCosts?: string, tenantPaysDescription?: string): {
  label: string;
  tone: 'positive' | 'neutral' | 'tenant-pays';
} {
  const mi = (moveInCosts || '').toLowerCase();
  const tp = (tenantPaysDescription || '').toLowerCase();

  const noFee = /\bno\s*(broker\s*)?fee\b/.test(mi) || /\bno\s*(broker\s*)?fee\b/.test(tp);
  if (noFee) return { label: 'No broker fee', tone: 'positive' };

  const tenantPaysBroker = /broker\s*fee/.test(tp) || /broker\s*fee/.test(mi);
  if (tenantPaysBroker) return { label: 'Tenant pays broker fee', tone: 'tenant-pays' };

  return { label: 'Fees: see listing', tone: 'neutral' };
}

export default function FareActFeeBadge({
  moveInCosts,
  tenantPaysDescription,
  variant = 'compact',
  className = '',
}: FareActFeeBadgeProps) {
  const { label, tone } = classifyFee(moveInCosts, tenantPaysDescription);

  const toneClass =
    tone === 'positive'
      ? 'bg-green-50 text-green-800 ring-green-200'
      : tone === 'tenant-pays'
        ? 'bg-amber-50 text-amber-900 ring-amber-200'
        : 'bg-gray-50 text-gray-700 ring-gray-200';

  if (variant === 'compact') {
    return (
      <span
        className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ring-1 ${toneClass} ${className}`}
        title="NYC FARE Act (LL 119/2024) requires disclosure of broker fee responsibility."
      >
        {label}
      </span>
    );
  }

  return (
    <div className={`text-xs ${className}`}>
      <span
        className={`inline-block font-medium px-2 py-1 rounded-md ring-1 ${toneClass}`}
      >
        FARE Act: {label}
      </span>
      {tenantPaysDescription && (
        <p className="mt-1 text-[11px] text-brand-dark/60 leading-snug">{tenantPaysDescription}</p>
      )}
    </div>
  );
}
