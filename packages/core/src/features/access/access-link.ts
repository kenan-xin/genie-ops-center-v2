/** The subject a link into Access chooses (R-37a, LK1). */
export type AccessLink = {
  readonly recipient?: string;
  readonly module?: string;
  readonly role?: string;
};

/**
 * The one place that names the query keys of a link into Access, so every screen that links there
 * agrees with what the Access route reads (LK11).
 */
export function accessHref(link: AccessLink): string {
  const query = new URLSearchParams();

  if (link.recipient !== undefined) query.set("recipient", link.recipient);

  if (link.module !== undefined) query.set("module", link.module);

  if (link.role !== undefined) query.set("role", link.role);

  return query.size === 0 ? "/admin/access" : `/admin/access?${query}`;
}

/**
 * The Overview with a module or a role chosen (`d8l5.46`). A role or a module is no recipient, so
 * its link has no Grants subject. The role wins when both are set.
 */
export function accessOverviewHref(link: {
  readonly module?: string | undefined;
  readonly role?: string | undefined;
}): string {
  const query = new URLSearchParams();

  if (link.role !== undefined) query.set("role", link.role);
  else if (link.module !== undefined) query.set("module", link.module);

  return query.size === 0
    ? "/admin/access/overview"
    : `/admin/access/overview?${query}`;
}
