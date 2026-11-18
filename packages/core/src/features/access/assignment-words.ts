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
 * "1 Jun 2026 by Priya Nair", in the viewer's zone. A row that setup wrote says "1 Jun 2026 at
 * setup" (P12-11); a row with no giver otherwise shows the date alone, because the break-glass
 * account wrote it, which no screen names (R-39).
 */
export function assignedOn(
  row: {
    readonly addedAt: string;
    readonly addedBy: string | null;
    readonly addedAtSetup?: boolean;
  },
  timeZone: string
): string {
  const date = fmtDate(row.addedAt, timeZone);

  if (row.addedBy !== null) return `${date} by ${row.addedBy}`;

  return row.addedAtSetup === true ? `${date} at setup` : date;
}

/** "Assigned 1 Jun 2026 by Priya Nair" (G10). */
export const assignedLabel = (
  row: Parameters<typeof assignedOn>[0],
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
