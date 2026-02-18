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
      className="bg-[#f9f8f6] py-20 sm:py-24 px-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-3xl mx-auto text-center">
        {/* Testimonial carousel */}
        <div className="relative min-h-[180px] sm:min-h-[150px]" aria-live="polite">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className={`transition-opacity duration-700 ${i === active ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
              aria-hidden={i !== active}
            >
              <blockquote className="font-display italic text-2xl sm:text-3xl text-gray-900 leading-snug">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <p className="mt-6 text-sm text-gray-500">
                {t.author} &mdash; {t.location}
              </p>
            </div>
          ))}
        </div>

        {/* Dot navigation */}
        <div className="flex items-center justify-center gap-2 mt-8" role="tablist" aria-label="Testimonial navigation">
          {testimonials.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === active}
              aria-label={`Testimonial ${i + 1}`}
              onClick={() => setActive(i)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === active ? 'bg-gray-900 scale-125' : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
