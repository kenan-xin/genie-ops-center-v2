"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { z } from "zod";

/** Filters to set by name; `undefined` removes one. */
export type AddressPatch<Name extends string> = {
  readonly [Key in Name]?: string | undefined;
};

/** Fired after this hook rewrites the address, which `replaceState` itself does not announce. */
const ADDRESS_CHANGE = "genie:address-filters";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(ADDRESS_CHANGE, onChange);

  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(ADDRESS_CHANGE, onChange);
  };
}

/**
 * A list's filters in the page address, so a filtered list can be shared and reloaded (design
 * review 1.4). `names` maps each filter to its query parameter; a parameter that does not parse is
 * left out. The server and the hydration read no address, so the first paint matches the server
 * page. A change replaces the history entry, which Next keeps in step with its router, and renders
 * nothing on the server.
 */
export function useAddressFilters<
  Fields extends Readonly<Record<string, z.ZodType>>,
>(
  schema: z.ZodObject<Fields>,
  names: Readonly<Record<keyof Fields & string, string>>
) {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => ""
  );

  const filters = useMemo(() => {
    const params = new URLSearchParams(search);

    const entries = Object.entries(names).flatMap(([key, name]) => {
      const parsed = schema.shape[key]?.safeParse(
        params.get(name) ?? undefined
      );

      return parsed?.success === true && parsed.data !== undefined
        ? [[key, parsed.data]]
        : [];
    });

    // SAFETY: each entry passed its own field of the schema, and every field is optional.
    return Object.fromEntries(entries) as z.infer<z.ZodObject<Fields>>;
  }, [search, schema, names]);

  /** Sets the named filters, read fresh from the address; `undefined` removes one. */
  const update = (patch: AddressPatch<keyof Fields & string>) => {
    const params = new URLSearchParams(window.location.search);
    const parameterOf: Readonly<Record<string, string>> = names;

    for (const [key, value] of Object.entries(patch)) {
      const name = parameterOf[key];

      if (name === undefined) continue;

      if (value === undefined || value.trim() === "") params.delete(name);
      else params.set(name, value);
    }

    const query = params.toString();

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query === "" ? "" : `?${query}`}`
    );
    window.dispatchEvent(new Event(ADDRESS_CHANGE));
  };

  return { filters, update };
}
