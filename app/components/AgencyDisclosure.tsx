/**
 * AgencyDisclosure — Required NYS RPL agency disclosure notice.
 *
 * NYS Real Property Law requires licensees to provide agency disclosure
 * at first substantive contact. This component renders the required notice
 * for lead capture forms (inquiry, contact, CMA, showing requests).
 *
 * Reference: DOS-1736-f, 19 NYCRR § 175.7
 */
export default function AgencyDisclosure() {
  return (
    <p className="text-[10px] leading-relaxed text-brand-dark/50">
      Mallan Real Estate Inc. is a licensed real estate broker (NY DOS #10991205323).
      By submitting this form you acknowledge that a licensee may represent the seller/landlord,
      the buyer/tenant, or act as a dual agent. For a full explanation of agency relationships,
      see our{' '}
      <a href="/sop" className="underline hover:text-brand-dark/70">
        Standardized Operating Procedures
      </a>.
    </p>
  );
}
