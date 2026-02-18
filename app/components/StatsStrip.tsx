'use client';

import { useEffect, useRef, useState } from 'react';

const stats = [
  {
    target: 5,
    suffix: '',
    label: 'Boroughs',
    sub: 'All of NYC covered',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    target: 46,
    suffix: '+',
    label: 'Active Listings',
    sub: 'Sales & rentals',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    target: 0,
    suffix: '',
    text: 'REBNY',
    label: 'Licensed',
    sub: 'RLS participant',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    target: 100,
    suffix: '%',
    label: 'Boutique',
    sub: 'Broker-direct service',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 11.5V14m0 0V16.5m0-2.5h10m-10 0H4.5m12.5 0V14m0 0V11.5m0 2.5H19.5M12 3v3m0 12v3M3 12h3m12 0h3" />
      </svg>
    ),
  },
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
    if (prefersReduced) {
      setValue(target);
      return;
    }

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

  if (text) {
    return <span ref={ref}>{text}</span>;
  }

  return (
    <span ref={ref}>
      {value}{suffix}
    </span>
  );
}

export default function StatsStrip() {
  return (
    <section className="bg-[#1a1a1a] py-12 px-4 border-t-2 border-[#C4A052]">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 rounded-2xl overflow-hidden">
          {stats.map((stat, i) => (
            <div key={i} className="bg-[#1a1a1a] px-8 py-8 text-center">
              <div className="text-[#C4A052]/60 flex justify-center mb-3">
                {stat.icon}
              </div>
              <p
                className="font-display text-4xl sm:text-5xl font-bold text-[#C4A052] leading-none mb-2"
                style={{ textShadow: '0 0 20px rgba(196, 160, 82, 0.15)' }}
              >
                <AnimatedValue target={stat.target} suffix={stat.suffix} text={stat.text} />
              </p>
              <p className="text-white font-bold text-sm tracking-wide uppercase mb-1">
                {stat.label}
              </p>
              <p className="text-white/40 text-xs">
                {stat.sub}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
