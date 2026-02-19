'use client';

import { useEffect, useRef } from 'react';

type RevealOptions = {
  y?: number;
  scale?: number;
  duration?: number;
  stagger?: number;
  ease?: string;
  start?: string;
  children?: boolean;
};

const DEFAULTS: RevealOptions = {
  y: 50,
  scale: 0.97,
  duration: 0.9,
  stagger: 0.08,
  ease: 'back.out(1.3)',
  start: 'top 92%',
  children: false,
};

export function useGsapReveal<T extends HTMLElement>(options: RevealOptions = {}) {
  const ref = useRef<T>(null);
  const opts = { ...DEFAULTS, ...options };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced-motion preference
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      gsap.registerPlugin(ScrollTrigger);

      if (opts.children) {
        const children = el.children;
        if (children.length === 0) return;

        Array.from(children).forEach((child, i) => {
          gsap.from(child, {
            scrollTrigger: { trigger: child, start: opts.start, once: true },
            opacity: 0,
            y: opts.y,
            scale: opts.scale,
            duration: opts.duration,
            delay: i * (opts.stagger ?? 0.08),
            ease: opts.ease,
          });
        });
      } else {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: opts.start, once: true },
          opacity: 0,
          y: opts.y,
          scale: opts.scale,
          duration: opts.duration,
          ease: opts.ease,
        });
      }

      cleanup = () => ScrollTrigger.getAll().forEach(t => t.kill());
    })();

    return () => cleanup?.();
  }, [opts.y, opts.scale, opts.duration, opts.stagger, opts.ease, opts.start, opts.children]);

  return ref;
}
