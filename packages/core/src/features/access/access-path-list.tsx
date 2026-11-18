"use client";

import { focusRing, LabelPill, StatusPill } from "@genie/ui";
import type { ReactNode } from "react";

import type { AccessRecipient } from "../../services/roles/effective-access.ts";
import type { InspectorAccess } from "./assignments-table.tsx";
import { overviewRows, pausedLabel } from "./overview-view.ts";

// The people and group sheets still read the type from this module (Task 5 moves them).
export type { InspectorAccess };

/**
 * One recipient's access, read-only, as the inspector Access tab shows it (G20, LK3). Line 1 names
 * the module and the role, line 2 the path and who added it, and a path that grants nothing names
 * its reasons. The rows come from the Overview shaper, so both screens say the same.
 */
export function AccessPathList(
  props: InspectorAccess & {
    readonly recipient: AccessRecipient;
    /** The sentence for no assignment, for example "No role is assigned to this person yet." */
    readonly empty: string;
    /** Opens the group of a "via" path; without it the name is plain text. */
    readonly onOpenGroup?: ((groupId: string) => void) | undefined;
  }
): ReactNode {
  if (props.error !== undefined) {
    return (
      <p role="alert" className="py-2 text-sm text-destructive">
        {props.error}
      </p>
    );
  }

  if (props.paths === undefined || props.catalogue === undefined) {
    return (
      <p role="status" className="py-2 text-sm text-muted-foreground">
        Loading access…
      </p>
    );
  }

  // The recipients list is read only for a module lookup, so an inspector passes none.
  const rows = overviewRows({
    subject: props.recipient,
    paths: props.paths,
    personPaths: props.recipient.type === "user" ? props.paths : undefined,
    catalogue: props.catalogue,
    recipients: { groups: [], people: [] },
    recordLabels: props.recordLabels,
  });

  if (rows.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">{props.empty}</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const tail = [
          ...(row.alsoThrough.length === 0
            ? []
            : [`also assigned via ${row.alsoThrough.join(", ")}`]),
          ...(row.addedBy === null ? [] : [`added by ${row.addedBy}`]),
        ].join(" · ");

        const viaGroup =
          row.holder.type === "group" &&
          row.holder.id !== props.recipient.id &&
          props.onOpenGroup !== undefined;

        return (
          <li key={row.key} className="flex flex-col gap-0.5 py-2 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground wrap-anywhere">
                {`${row.module} · ${row.role}`}
              </span>
              {row.record === null ? null : (
                <LabelPill>
                  <span className="wrap-anywhere">{`One record · ${row.record}`}</span>
                </LabelPill>
              )}
              {row.custom ? <LabelPill>Custom role</LabelPill> : null}
              {row.notInEffect.map((reason) => (
                <StatusPill key={reason} tone="neutral">
                  {pausedLabel(reason)}
                </StatusPill>
              ))}
            </span>
            <span className="text-xs text-muted-foreground wrap-anywhere">
              {viaGroup ? (
                <>
                  Assigned via{" "}
                  <button
                    type="button"
                    className={`font-medium text-foreground underline ${focusRing}`}
                    onClick={() => props.onOpenGroup?.(row.holder.id)}
                  >
                    {row.holder.name}
                  </button>
                  {tail === "" ? "" : ` · ${tail}`}
                </>
              ) : (
                [
                  row.holder.id === props.recipient.id
                    ? row.path
                    : `Assigned via ${row.path}`,
                  tail,
                ]
                  .filter((part) => part !== "")
                  .join(" · ")
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
