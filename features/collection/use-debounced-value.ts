"use client";

import { useEffect, useState } from "react";

/**
 * Collection Foundation — shared debounced-value hook.
 *
 * Keeps transient input state local (e.g. the search field while typing)
 * and only propagates the settled value, which callers commit to the URL:
 *
 *   local input → debounce → URL → query
 */
export function useDebouncedValue(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
