/**
 * AntiDiscriminationNotice — NY DOS §175.28 first-substantive-contact disclosure.
 *
 * 19 NYCRR §175.28 requires licensees to provide the NYS Housing and
 * Anti-Discrimination Disclosure form (DOS-1736) at or before first
 * substantive contact with a prospective buyer/tenant.
 *
 * This component renders the required notice + link to the official form.
 * Use on every substantive lead-capture form (inquiry, CMA, contact, RSVP,
 * sign-up with intake fields).
 *
 * REBNY compliance reference: `compliance/NYC-NYS-REQUIREMENTS.md` §175.28.
 * Official DOS form: https://dos.ny.gov/system/files/documents/2020/01/anti-discrim_disclosure_rp-469.pdf
 */
export default function AntiDiscriminationNotice() {
  return (
    <p className="text-[10px] leading-relaxed text-brand-dark/60">
      <strong className="text-brand-dark/80">
        NYS Housing Anti-Discrimination Disclosure:
      </strong>{' '}
      All properties are available on an equal opportunity basis. It is
      unlawful to discriminate on the basis of race, color, religion, national
      origin, sex, age, marital status, familial status, disability, military
      status, sexual orientation, gender identity, lawful source of income, or
      any other protected class under federal, NY State, or NYC law. By
      submitting this form you acknowledge receipt of this disclosure. View
      the full NYS disclosure form (DOS-1736-a) at{' '}
      <a
        href="https://dos.ny.gov/system/files/documents/2020/01/anti-discrim_disclosure_rp-469.pdf"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-brand-dark/80"
      >
        dos.ny.gov
      </a>
      .
    </p>
  );
}
