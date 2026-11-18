"use client";

import { useSyncExternalStore } from "react";

const PHONE_QUERY = "(max-width: 767px)";

/** True below 768 px, where the deck page takes its phone layout. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(PHONE_QUERY);

      query.addEventListener("change", notify);

      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  );
}
