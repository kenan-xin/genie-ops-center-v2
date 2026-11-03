"use client";

import { focusRing, LabelPill, StatusPill } from "@genie/ui";
import type { ReactNode } from "react";

import type {
  AccessPath,
  AccessRecipient,
} from "../../services/roles/effective-access.ts";
import type { GrantRow } from "../../services/roles/grants.ts";
import { overviewRows } from "./overview-view.ts";

/** The reads that the inspector Access tab shows, passed only to a viewer with the Roles key (LK4). */
export type InspectorAccess = {
  /** The recipient's paths from the S2-19 read; undefined while they load. */
  readonly paths: readonly AccessPath[] | undefined;
  readonly catalogue: readonly GrantRow[] | undefined;
  /** Record labels by `scopeKey`, only for records the viewer can open (AD10). */
  readonly recordLabels: ReadonlyMap<string, string>;
  readonly error?: string | undefined;
};

/**
 * One recipient's access, read-only, as the inspector Access tab shows it (G20, LK3). Line 1 names
 * the module and the role, line 2 the path and who added it, and a path that grants nothing names
 * its reasons. The rows come from the Overview shaper, so both screens say the same.
 */
export function AccessPathList(
  props: InspectorAccess & {
    readonly recipient: AccessRecipient;
    /** The sentence for no path, for example "This person holds no role yet." */
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
            : [`also through ${row.alsoThrough.join(", ")}`]),
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
              {row.notInEffect.length === 0 ? null : (
                <StatusPill tone="neutral">Not in effect</StatusPill>
              )}
            </span>
            <span className="text-xs text-muted-foreground wrap-anywhere">
              {viaGroup ? (
                <>
                  via{" "}
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
                [row.path, tail].filter((part) => part !== "").join(" · ")
              )}
            </span>
            {row.notInEffect.length === 0 ? null : (
              <span className="text-xs text-muted-foreground">
                {row.notInEffect.join(". ")}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
