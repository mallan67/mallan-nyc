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
      try {
        const { gsap } = await import('gsap');
        const { ScrollTrigger } = await import('gsap/ScrollTrigger');
        gsap.registerPlugin(ScrollTrigger);

        // Check if element is already in/near viewport — if so, animate immediately
        // instead of waiting for scroll. This prevents above-the-fold content from
        // going invisible while waiting for ScrollTrigger.
        const rect = el.getBoundingClientRect();
        const isNearViewport = rect.top < window.innerHeight * 1.1;

        if (opts.children) {
          const children = el.children;
          if (children.length === 0) return;

          gsap.set(Array.from(children), { opacity: 0, y: opts.y, scale: opts.scale });

          if (isNearViewport) {
            // Already visible — animate in immediately with stagger
            Array.from(children).forEach((child, i) => {
              gsap.to(child, {
                opacity: 1,
                y: 0,
                scale: 1,
                duration: opts.duration,
                delay: i * (opts.stagger ?? 0.08),
                ease: opts.ease,
              });
            });
          } else {
            Array.from(children).forEach((child, i) => {
              ScrollTrigger.create({
                trigger: child,
                start: opts.start,
                once: true,
                onEnter: () => {
                  gsap.to(child, {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: opts.duration,
                    delay: i * (opts.stagger ?? 0.08),
                    ease: opts.ease,
                  });
                },
              });
            });
          }
        } else {
          gsap.set(el, { opacity: 0, y: opts.y, scale: opts.scale });

          if (isNearViewport) {
            // Already visible — animate in immediately
            gsap.to(el, {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: opts.duration,
              ease: opts.ease,
            });
          } else {
            ScrollTrigger.create({
              trigger: el,
              start: opts.start,
              once: true,
              onEnter: () => {
                gsap.to(el, {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  duration: opts.duration,
                  ease: opts.ease,
                });
              },
            });
          }
        }

        cleanup = () => ScrollTrigger.getAll().forEach(t => t.kill());
      } catch {
        // GSAP failed to load — ensure elements stay visible
        el.style.opacity = '1';
      }
    })();

    return () => cleanup?.();
  }, [opts.y, opts.scale, opts.duration, opts.stagger, opts.ease, opts.start, opts.children]);

  return ref;
}
