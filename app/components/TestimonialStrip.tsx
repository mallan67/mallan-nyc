/**
 * TestimonialStrip — single powerful client quote
 * Playfair Display italic gives it editorial, premium gravitas
 * Compliance: no results guarantees, factual attribution only
 */
export default function TestimonialStrip() {
  return (
    <section className="bg-stone-50 py-20 sm:py-24 px-4">
      <div className="max-w-4xl mx-auto text-center">

        {/* Decorative quote mark */}
        <div className="font-display text-8xl text-[#C4A052]/20 leading-none select-none mb-2" aria-hidden>
          &ldquo;
        </div>

        <blockquote className="font-display text-2xl sm:text-3xl md:text-4xl italic text-gray-900 leading-[1.35] max-w-3xl mx-auto">
          Maya found us a beautiful pre-war co-op on the Upper West Side that never
          hit StreetEasy. Closed in six weeks.
        </blockquote>

        {/* Gold rule */}
        <span className="gold-rule mx-auto mt-8 mb-5" />

        <p className="text-sm font-semibold text-gray-500 tracking-wider uppercase">
          J. &amp; S. Miller &nbsp;&middot;&nbsp; Upper West Side
        </p>

      </div>
    </section>
  );
}
