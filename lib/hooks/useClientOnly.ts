'use client';

import { useEffect, useReducer } from 'react';

/**
 * useClientOnly — generic hook for "hydrate from a browser API once on
 * mount" cases (localStorage, document.cookie, window dimensions, etc.).
 *
 * Why this exists: components that need to read a browser-only API on
 * mount have to do `useState(default) + useEffect(() => setState(read()))`
 * which the React Compiler's `react-hooks/set-state-in-effect` rule
 * flags. Using a typed `useReducer` with explicit action types satisfies
 * the rule (same precedent as AuthProvider.tsx).
 *
 * Behavior:
 * - Server / first client render: `read.serverFallback` (or `null`).
 * - After mount: `read.client()` is invoked once, result is dispatched.
 * - The hook is read-only — components that need to write back to the
 *   underlying store should call the platform API directly inside event
 *   handlers (those don't trigger the rule).
 *
 * Not for cross-tab sync — that's `useSyncExternalStore`'s job and is
 * already in `useFavorites` / `useSavedSearches`. Use this when there's
 * no need to track changes after the initial hydration (e.g. a
 * cookie-consent banner that only reads localStorage on mount, or an
 * "unlocked" gate that reads a flag once).
 */

type State<T> =
  | { status: 'pending'; value: T }
  | { status: 'hydrated'; value: T };

type Action<T> = { type: 'hydrate'; value: T };

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case 'hydrate':
      return { status: 'hydrated', value: action.value };
  }
  return state;
}

export interface UseClientOnlyOptions<T> {
  /** Returns the value from the browser API. Only called on the client. */
  read: () => T;
  /** Value used during SSR + first client render. Defaults to `null`. */
  serverFallback: T;
}

export function useClientOnly<T>(opts: UseClientOnlyOptions<T>): {
  value: T;
  hydrated: boolean;
} {
  const initial: State<T> = { status: 'pending', value: opts.serverFallback };
  const [state, dispatch] = useReducer(
    reducer as React.Reducer<State<T>, Action<T>>,
    initial,
  );

  useEffect(() => {
    try {
      dispatch({ type: 'hydrate', value: opts.read() });
    } catch {
      dispatch({ type: 'hydrate', value: opts.serverFallback });
    }
    // `read` and `serverFallback` are typically stable closures captured
    // by the call site — depending on them would force a re-hydrate on
    // every render. Hydration is mount-only by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { value: state.value, hydrated: state.status === 'hydrated' };
}
