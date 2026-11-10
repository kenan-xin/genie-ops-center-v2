import type { DashboardFilters } from "../../contract.ts";
import { ADDRESS, writeFilterAddress } from "../filter-address.ts";

/** Replaces the dashboard filter parameters of the story address, keeping Storybook's own. */
function replace(patch: Readonly<Record<string, string | undefined>>) {
  const params = new URLSearchParams();

  for (const [name, value] of new URLSearchParams(window.location.search)) {
    if (
      name !== ADDRESS.range &&
      name !== ADDRESS.fields &&
      !name.startsWith("f.")
    )
      params.append(name, value);
  }

  for (const [name, value] of Object.entries(patch)) {
    if (value !== undefined && value !== "") params.set(name, value);
  }

  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}?${params}`
  );
}

/** Opens the story with `filters` in the address, and clears them after it (S7-46). */
export function withFilterAddress(filters: DashboardFilters | null) {
  replace(filters === null ? {} : writeFilterAddress(filters));

  return () => replace({});
}

/** One parameter of the story address. */
export const addressParam = (name: string) =>
  new URLSearchParams(window.location.search).get(name);
