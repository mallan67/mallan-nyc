import {
  isMallanOwnedListing,
  MALLAN_EXCLUSIVE_BADGE_TEXT,
  MALLAN_EXCLUSIVE_BADGE_TITLE,
  type FeaturedOrderable,
} from '@/lib/featured/featured-ordering';

type BadgeListing = Pick<FeaturedOrderable, 'id' | 'mlsId' | 'listing_id' | '_source' | '_mallanListed'>;

/**
 * The gold "Mallan Exclusive" mark for search cards, the agent's listings and the listing detail page.
 *
 * Renders only for a listing that is Mallan's own: Mallan-authored (SL-/RL-, `_source: 'exclusive'`) or a VERIFIED Mallan-listed Cotality listing
 * (`_mallanListed`, set by the server from the source fields, never from the browser). Everything else renders nothing, so another brokerage's
 * listing can never carry Mallan's mark. The title is the fixed Mallan attribution string (it never repeats an RLS/syndication claim).
 */
export default function MallanExclusiveBadge({
  listing,
  size = 'sm',
}: {
  listing: BadgeListing;
  size?: 'sm' | 'md';
}) {
  if (!isMallanOwnedListing(listing)) return null;
  const sizing = size === 'md' ? 'text-[13px] px-3.5 py-1.5' : 'text-[11px] px-2 py-0.5';
  return (
    <span
      title={MALLAN_EXCLUSIVE_BADGE_TITLE}
      data-testid="mallan-exclusive-badge"
      className={`inline-block uppercase tracking-wide font-medium rounded-full bg-brand-gold/10 text-brand-gold-deep ring-1 ring-brand-gold/30 ${sizing}`}
    >
      {MALLAN_EXCLUSIVE_BADGE_TEXT}
    </span>
  );
}
