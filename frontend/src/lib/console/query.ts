"use client";

/**
 * One read path for the whole console.
 *
 * Before this there were eleven hand-rolled copies of the same
 * load/error/NotSignedIn/retry dance, each subtly different, and every
 * expanded row refetched the entire analytics payload to read one number.
 *
 * This is a cache, not a state library. Stale-while-revalidate over a
 * module-level Map: a second reader of the same key gets the cached value
 * immediately and a refresh in the background. React Query would do this
 * and a great deal more, and the "great deal more" is the part this
 * console does not need.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { bounceToSignIn, NotSignedIn } from "./auth";

type Entry = { data: unknown; at: number; inflight?: Promise<unknown> };

const CACHE = new Map<string, Entry>();
const WATCHERS = new Map<string, Set<() => void>>();

/** How long a value is served without a background refresh. */
const FRESH_MS = 30_000;

function notify(key: string) {
  WATCHERS.get(key)?.forEach((fn) => fn());
}

/** Drop a key (and anything beneath it, prefix-wise) and wake its readers. */
export function invalidate(...keys: string[]): void {
  for (const key of keys) {
    for (const cached of [...CACHE.keys()]) {
      if (cached === key || cached.startsWith(`${key}:`)) {
        CACHE.delete(cached);
        notify(cached);
      }
    }
    notify(key);
  }
}

/**
 * What each mutation makes stale.
 *
 * Without this the cache is worse than none: confirm an order, walk back to
 * the Board, and the queue still says four. Every mutation names what the
 * owner might now be looking at.
 */
export const INVALIDATES: Record<string, string[]> = {
  orderMoved: ["orders", "today", "customers", "commissions"],
  orderChanged: ["orders", "today"],
  quoteSent: ["commissions", "today"],
  commissionMoved: ["commissions", "today", "orders"],
  commissionChanged: ["commissions", "today"],
  messageRead: ["messages", "today"],
  messageArchived: ["messages", "today"],
  pieceChanged: ["pieces", "today", "make"],
  batchChanged: ["pieces", "make", "waiting"],
  mediaChanged: ["pieces"],
  variantChanged: ["pieces"],
  attributeChanged: ["pieces"],
  categoryChanged: ["categories", "pieces"],
  feedChanged: ["feed"],
  customerChanged: ["customers"],
};

/** Fire the invalidation set for a named mutation. */
export function afterMutation(kind: keyof typeof INVALIDATES): void {
  invalidate(...(INVALIDATES[kind] ?? []));
}

export interface QueryState<T> {
  data: T | undefined;
  error: string | null;
  /** True only when there is nothing to show yet. A refresh over existing
   *  data is `stale`, not `loading` — the view dims, it never flashes. */
  loading: boolean;
  stale: boolean;
  reload: () => void;
}

/**
 * @param key   cache identity. `null` skips the fetch entirely (for a
 *              request that depends on something not chosen yet).
 * @param fetcher must be stable or wrapped in useCallback by the caller.
 */
export function useConsoleQuery<T>(key: string | null, fetcher: () => Promise<T>): QueryState<T> {
  const cached = key ? (CACHE.get(key)?.data as T | undefined) : undefined;
  const [, force] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(
    (force_: boolean) => {
      if (!key) return;
      const entry = CACHE.get(key);
      if (entry?.inflight) return;
      if (!force_ && entry && Date.now() - entry.at < FRESH_MS) return;

      setStale(Boolean(entry));
      const promise = fetcherRef
        .current()
        .then((data) => {
          CACHE.set(key, { data, at: Date.now() });
          setError(null);
          notify(key);
          return data;
        })
        .catch((problem: unknown) => {
          if (problem instanceof NotSignedIn) {
            bounceToSignIn();
            return;
          }
          // Keep whatever is cached on screen; the error rides beside it.
          CACHE.set(key, { data: entry?.data, at: Date.now() });
          setError(problem instanceof Error ? problem.message : "Could not load this");
          notify(key);
        })
        .finally(() => {
          const current = CACHE.get(key);
          if (current) delete current.inflight;
          setStale(false);
        });

      CACHE.set(key, { data: entry?.data, at: entry?.at ?? 0, inflight: promise });
    },
    [key],
  );

  useEffect(() => {
    if (!key) return;
    const wake = () => force((n) => n + 1);
    let set = WATCHERS.get(key);
    if (!set) {
      set = new Set();
      WATCHERS.set(key, set);
    }
    set.add(wake);
    run(false);
    return () => {
      set?.delete(wake);
      if (set?.size === 0) WATCHERS.delete(key);
    };
  }, [key, run]);

  return {
    data: cached,
    error,
    loading: cached === undefined && error === null,
    stale,
    reload: useCallback(() => {
      if (key) CACHE.delete(key);
      run(true);
    }, [key, run]),
  };
}

/**
 * A write, with the parts every write in this console needs: it cannot be
 * fired twice, it never lies about what the server did, and it says what is
 * now stale. Nothing here is optimistic — a status move sends the customer
 * an email and a WhatsApp message, and showing "delivered" before the
 * server agreed would tell the owner someone was notified who was not.
 */
export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const running = useRef(false);

  const mutate = useCallback(
    async <T,>(
      work: () => Promise<T>,
      options: { invalidates?: (keyof typeof INVALIDATES)[]; onDone?: (result: T) => void } = {},
    ): Promise<T | undefined> => {
      if (running.current) return undefined;
      running.current = true;
      setBusy(true);
      setProblem(null);
      try {
        const result = await work();
        options.invalidates?.forEach(afterMutation);
        options.onDone?.(result);
        return result;
      } catch (failure) {
        if (failure instanceof NotSignedIn) bounceToSignIn();
        else setProblem(failure instanceof Error ? failure.message : "That did not work");
        return undefined;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [],
  );

  return { mutate, busy, problem, clearProblem: useCallback(() => setProblem(null), []) };
}
