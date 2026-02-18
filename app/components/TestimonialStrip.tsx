'use client';

import { useState, useEffect, useCallback } from 'react';

const testimonials = [
  {
    quote: 'Maya found us a beautiful pre-war co-op on the Upper West Side that never hit StreetEasy. Closed in six weeks.',
    author: 'J. & S. Miller',
    location: 'Upper West Side',
  },
  {
    quote: 'From the first showing to the final walkthrough, Maya handled every detail. Our Tribeca condo sold above ask in under a month.',
    author: 'R. Chen',
    location: 'Tribeca',
  },
  {
    quote: 'We relocated from San Francisco with two weeks to find a rental. Maya lined up viewings, negotiated the lease, and made it seamless.',
    author: 'D. & M. Alvarez',
    location: 'Brooklyn Heights',
  },
  {
    quote: 'As first-time buyers in NYC, we needed someone who could guide us through the co-op board process. Maya was patient, thorough, and always available.',
    author: 'T. Nakamura',
    location: 'Upper East Side',
  },
];

export default function TestimonialStrip() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => {
    setActive((prev) => (prev + 1) % testimonials.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(next, 6000);
    return () => clearInterval(id);
  }, [paused, next]);

  return (
    <section
      className="bg-stone-50 py-20 sm:py-24 px-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-4xl mx-auto text-center">
        {/* Decorative quote mark */}
        <div className="font-display text-8xl text-[#C4A052]/20 leading-none select-none mb-2" aria-hidden>
          &ldquo;
        </div>

        {/* Testimonial carousel */}
        <div className="relative min-h-[160px] sm:min-h-[140px]" aria-live="polite">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className={`transition-opacity duration-700 ${i === active ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
              aria-hidden={i !== active}
            >
              <blockquote className="font-display text-2xl sm:text-3xl md:text-4xl italic text-gray-900 leading-[1.35] max-w-3xl mx-auto">
                {t.quote}
              </blockquote>

              <span className="gold-rule mx-auto mt-8 mb-5" />

              <p className="text-sm font-semibold text-gray-500 tracking-wider uppercase">
                {t.author} &nbsp;&middot;&nbsp; {t.location}
              </p>
            </div>
          ))}
        </div>

        {/* Dot navigation */}
        <div className="flex items-center justify-center gap-2.5 mt-8" role="tablist" aria-label="Testimonial navigation">
          {testimonials.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === active}
              aria-label={`Testimonial ${i + 1}`}
              onClick={() => setActive(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                i === active ? 'bg-[#C4A052] scale-110' : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
