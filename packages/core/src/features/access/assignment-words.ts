import type { AccessHolder } from "../../services/roles/effective-access.ts";
import type { RecipientRow } from "../../services/roles/recipients.ts";
import { fmtDate } from "../audit/helpers.ts";

/** "Group" for one made here, "Directory group" for one the identity provider sends (G14). */
export const groupKindLabel = (source: "idp" | "local") =>
  source === "idp" ? "Directory group" : "Group";

/** "1 member", "12 members". */
export const memberCountLabel = (count: number) =>
  `${count} ${count === 1 ? "member" : "members"}`;

/** "Group · 6 members", "Directory group · 17 members", or a person's email (add-access capture). */
export const recipientDetail = (row: RecipientRow): string =>
  row.type === "user"
    ? row.email
    : `${groupKindLabel(row.source)} · ${memberCountLabel(row.memberCount)}`;

/**
 * "1 Jun 2026 by Priya Nair", in the viewer's zone. A row with no giver shows the date alone:
 * setup made it, or the break-glass account did, which no screen names (R-39).
 */
export function assignedOn(
  row: { readonly addedAt: string; readonly addedBy: string | null },
  timeZone: string
): string {
  const date = fmtDate(row.addedAt, timeZone);

  return row.addedBy === null ? date : `${date} by ${row.addedBy}`;
}

/** "Assigned 1 Jun 2026 by Priya Nair" (G10). */
export const assignedLabel = (
  row: { readonly addedAt: string; readonly addedBy: string | null },
  timeZone: string
) => `Assigned ${assignedOn(row, timeZone)}`;

/**
 * The line under a holder on role detail (role-detail.prototype.html): "Person · Direct",
 * "Group · 5 members", "Directory group · 12 members". A group whose count did not arrive shows
 * its kind alone.
 */
export function holderLine(
  holder: AccessHolder,
  memberCounts: Readonly<Record<string, number>>
): string {
  if (holder.type === "user") return "Person · Direct";

  const count = memberCounts[holder.id];
  const kind = groupKindLabel(holder.source);

  return count === undefined ? kind : `${kind} · ${memberCountLabel(count)}`;
}
