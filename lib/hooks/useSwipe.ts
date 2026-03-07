import { useRef, useCallback } from 'react';

const SWIPE_THRESHOLD = 40;

/** Lightweight touch swipe hook for photo carousels */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const startX = useRef(0);
  const deltaX = useRef(0);
  const swiping = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    deltaX.current = 0;
    swiping.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    deltaX.current = e.touches[0].clientX - startX.current;
    if (Math.abs(deltaX.current) > 10) {
      swiping.current = true;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (Math.abs(deltaX.current) > SWIPE_THRESHOLD) {
      if (deltaX.current < 0) {
        onLeft();
      } else {
        onRight();
      }
    }
    deltaX.current = 0;
  }, [onLeft, onRight]);

  /** Call in onClick to prevent navigation when user was swiping */
  const cancelIfSwiping = useCallback((e: React.MouseEvent) => {
    if (swiping.current) {
      e.preventDefault();
      swiping.current = false;
    }
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd, cancelIfSwiping };
}
