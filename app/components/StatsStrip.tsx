'use client';

import { useEffect, useRef, useState } from 'react';

const stats = [
  { target: 5, suffix: '', label: 'Boroughs' },
  { target: 46, suffix: '+', label: 'Active Listings' },
  { target: 0, suffix: '', text: 'REBNY', label: 'Licensed' },
  { target: 100, suffix: '%', label: 'Boutique' },
];

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function AnimatedValue({ target, suffix, text }: { target: number; suffix: string; text?: string }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) { setValue(target); return; }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animated.current) {
          animated.current = true;
          if (text) { setValue(target); return; }
          const duration = 1800;
          const start = performance.now();
          function tick(now: number) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            setValue(Math.round(easeOutCubic(progress) * target));
            if (progress < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, text]);

  if (text) return <span ref={ref}>{text}</span>;
  return <span ref={ref}>{value}{suffix}</span>;
}

export default function StatsStrip() {
  return (
    <section className="py-12 sm:py-14 px-4 border-t border-gray-200">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x divide-gray-200">
          {stats.map((stat, i) => (
            <div key={i} className="text-center px-4">
              <p className="text-3xl sm:text-4xl font-bold text-gray-900 leading-none mb-1">
                <AnimatedValue target={stat.target} suffix={stat.suffix} text={stat.text} />
              </p>
              <p className="text-sm text-gray-500 font-medium">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
