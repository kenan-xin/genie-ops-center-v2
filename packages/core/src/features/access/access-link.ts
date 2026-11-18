import type { AccessRecipient } from "../../services/roles/effective-access.ts";

/** The subject a link into Access chooses (R-37a, LK1). */
export type AccessLink = {
  readonly recipient?: string;
  readonly module?: string;
  readonly role?: string;
};

/**
 * Where `/admin/access` sends a request (P12-9). With `recipient`, Grants with every parameter as
 * given, a repeated one too; without it, the Overview by module and role (`d8l5.46`).
 */
export function accessLandingHref(
  params: Readonly<Record<string, string | readonly string[] | undefined>>
): string {
  const first = (name: string) => [params[name] ?? []].flat()[0];

  if (first("recipient") === undefined) {
    return accessOverviewHref({ module: first("module"), role: first("role") });
  }

  const query = new URLSearchParams();

  for (const [name, value] of Object.entries(params)) {
    for (const each of [value ?? []].flat()) query.append(name, each);
  }

  return `/admin/access/grants?${query}`;
}

/**
 * The one place that names the query keys of a link into Access, so every screen that links there
 * agrees with what the Access routes read (LK11).
 */
export function accessHref(link: AccessLink): string {
  return accessLandingHref(link);
}

/**
 * The Overview filtered to a person or group, a module or a role (`d8l5.46`, P12-8, P12-10). Each
 * given parameter is set.
 */
export function accessOverviewHref(link: {
  readonly who?: AccessRecipient | undefined;
  readonly module?: string | undefined;
  readonly role?: string | undefined;
}): string {
  const query = new URLSearchParams();

  if (link.who !== undefined)
    query.set("who", `${link.who.type}:${link.who.id}`);

  if (link.module !== undefined) query.set("module", link.module);

  if (link.role !== undefined) query.set("role", link.role);

  return query.size === 0
    ? "/admin/access/overview"
    : `/admin/access/overview?${query}`;
}
