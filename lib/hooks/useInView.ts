'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * useInView — true once the element has been within `rootMargin` of the viewport. It never goes back to false.
 *
 * Use it to hold back a widget's data request until a visitor is about to see the widget. The margin is generous so the answer
 * is usually there by the time the widget is scrolled to; it gates the REQUEST, not the markup, so layout is unchanged.
 *
 *   const [ref, inView] = useInView<HTMLDivElement>();
 *   useEffect(() => { if (!inView) return; … fetch … }, [inView]);
 *   return <div ref={ref}>…</div>;
 *
 * - A callback ref (no effect): the observer follows the element, so a widget that swaps the element it renders keeps working.
 * - One-way: once seen, the observer is disconnected and the value stays true (scrolling away must not cancel or repeat a load).
 * - A browser without IntersectionObserver is treated as "in view", so the widget still loads.
 * - A widget that renders nothing until its data arrives needs something to observe: render a zero-size, absolutely positioned
 *   `<div ref={ref} aria-hidden="true" className="absolute" />` in its place. Absolute with no offsets keeps its static position and
 *   takes no space.
 */
export const IN_VIEW_ROOT_MARGIN = '400px';

/** For a section that disappears when it has nothing to show: the answer should land before the visitor can see the page below it move. */
export const LAZY_SECTION_ROOT_MARGIN = '800px';

export function useInView<T extends Element = HTMLElement>(
  rootMargin: string = IN_VIEW_ROOT_MARGIN,
): [(node: T | null) => void, boolean] {
  const [inView, setInView] = useState(false);
  const seen = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (node: T | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!node || seen.current) return;

      const reveal = () => {
        seen.current = true;
        setInView(true);
      };
      if (typeof IntersectionObserver === 'undefined') {
        reveal();
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          io.disconnect();
          if (observer.current === io) observer.current = null;
          reveal();
        },
        { rootMargin },
      );
      observer.current = io;
      io.observe(node);
    },
    [rootMargin],
  );

  return [ref, inView];
}
