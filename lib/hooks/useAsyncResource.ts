'use client';

import { useCallback, useEffect, useReducer } from 'react';

/**
 * useAsyncResource — generic data-fetching hook for fetch-on-mount
 * components.
 *
 * Why this exists: every component that does the canonical "fetch on
 * mount + setState" pattern triggers the React Compiler's
 * `react-hooks/set-state-in-effect` rule once per setState call. That
 * rule is correct in spirit (raw setState in an effect *can* cascade
 * renders) but it doesn't recognize that a reducer dispatching explicit
 * state-machine actions does not have that risk: dispatch identity is
 * stable, and each action is an explicit transition, not an arbitrary
 * setState.
 *
 * AuthProvider.tsx uses the same `useReducer` pattern with action types
 * and the rule does not flag it — that's the green-light precedent for
 * this hook. Centralizing the fetch lifecycle here means consumers stay
 * declarative (`const { data, loading, error } = useAsyncResource(...)`)
 * and the rule stays quiet across the call sites.
 *
 * Behavior:
 * - When `key` is null/undefined the hook is idle (no fetch, no loading).
 * - When `key` changes the previous request is cancelled (AbortController)
 *   and the resource is reset to `loading=true` synchronously via a
 *   reset action — replaces the stale data so consumers don't render
 *   the previous fetch's content.
 * - `fetcher` receives the AbortSignal and the resolved key; whatever it
 *   returns becomes `data`.
 * - Errors throw → action `error`. AbortError is swallowed.
 *
 * Not a replacement for SWR/React Query — no caching, dedupe, or
 * revalidation. Sized for the existing fetch-on-mount components in
 * this repo.
 */

type State<T> =
  | { status: 'idle'; data: null; loading: false; error: null }
  | { status: 'loading'; data: T | null; loading: true; error: null }
  | { status: 'success'; data: T; loading: false; error: null }
  | { status: 'error'; data: null; loading: false; error: Error };

type Action<T> =
  | { type: 'reset' }
  | { type: 'fetch-start' }
  | { type: 'fetch-success'; data: T }
  | { type: 'fetch-error'; error: Error };

const IDLE: State<unknown> = { status: 'idle', data: null, loading: false, error: null };

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case 'reset':
      return IDLE as State<T>;
    case 'fetch-start':
      return {
        status: 'loading',
        // Keep prior data during a re-fetch so consumers can render the
        // previous payload while loading. Cleared on key change because
        // the caller dispatches `reset` first.
        data: state.status === 'success' ? state.data : null,
        loading: true,
        error: null,
      };
    case 'fetch-success':
      return { status: 'success', data: action.data, loading: false, error: null };
    case 'fetch-error':
      return { status: 'error', data: null, loading: false, error: action.error };
  }
}

export interface UseAsyncResourceResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  status: State<T>['status'];
  /** Re-runs `fetcher(key)` against the current key. No-op if `key` is null. */
  refetch: () => void;
}

/**
 * @param key
 *   When `null`/`undefined` the hook is idle and `fetcher` is not called.
 *   Any change of value retriggers the fetch with the new key. Use a
 *   primitive (string, number) or a stable URL — object keys cause
 *   re-fetches on every render.
 * @param fetcher
 *   Called with `(key, signal)` whenever `key` changes. Should reject if
 *   the request fails. AbortError rejections are silently dropped.
 */
export function useAsyncResource<T>(
  key: string | number | null | undefined,
  fetcher: (key: string | number, signal: AbortSignal) => Promise<T>,
): UseAsyncResourceResult<T> {
  const [state, dispatch] = useReducer(reducer as React.Reducer<State<T>, Action<T>>, IDLE as State<T>);
  // `tick` increments on each refetch() call — folded into the effect's
  // dependency array so the fetch re-runs against the current key.
  const [tick, dispatchTick] = useReducer((t: number) => t + 1, 0);

  useEffect(() => {
    if (key == null) {
      dispatch({ type: 'reset' });
      return;
    }
    const controller = new AbortController();
    dispatch({ type: 'fetch-start' });
    fetcher(key, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        dispatch({ type: 'fetch-success', data });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const error = err instanceof Error ? err : new Error(String(err));
        dispatch({ type: 'fetch-error', error });
      });
    return () => controller.abort();
  }, [key, fetcher, tick]);

  const refetch = useCallback(() => dispatchTick(), []);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    status: state.status,
    refetch,
  };
}
