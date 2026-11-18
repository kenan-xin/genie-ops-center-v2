"use client";

import {
  DataTable,
  type DataTableColumn,
  EmptyState,
  focusRing,
  StatusPill,
} from "@genie/ui";
import type { ReactNode } from "react";

import type {
  AccessPath,
  AccessRecipient,
} from "../../services/roles/effective-access.ts";
import type { GrantRow } from "../../services/roles/grants.ts";
import { PageLink } from "../shell/page-link.tsx";
import { assignedLabel, assignedOn } from "./assignment-words.ts";
import {
  type OverviewRow,
  overviewRows,
  pausedLabel,
} from "./overview-view.ts";

/** The reads that a person or group sheet's Roles tab shows (LK4, R-37e). */
export type InspectorAccess = {
  /** The recipient's paths from the S2-19 read; undefined while they load. */
  readonly paths: readonly AccessPath[] | undefined;
  readonly catalogue: readonly GrantRow[] | undefined;
  /** Record labels by `scopeKey`, only for records the viewer can open (AD10). */
  readonly recordLabels: ReadonlyMap<string, string>;
  readonly error?: string | undefined;
};

export type AssignmentsTableProps = InspectorAccess & {
  readonly recipient: AccessRecipient;
  /** The viewer's zone, for "Assigned <date> by <name>". */
  readonly timeZone: string;
  /** No assignment: for example "No roles assigned" and "This person can sign in but sees no modules." */
  readonly empty: { readonly title: string; readonly description: string };
  /** A role's address, only for a viewer who may open Roles; without it the role is plain text (R-37e). */
  readonly roleHref?: ((roleId: string) => string) | undefined;
  /** The address of the group in an Assigned via value, only for a viewer who may open Groups; without it the group name is plain text (C11-7). */
  readonly groupHref?: ((groupId: string) => string) | undefined;
};

const paused = (row: OverviewRow) =>
  row.notInEffect.map((reason) => (
    <StatusPill key={reason} tone="warning">
      {pausedLabel(reason)}
    </StatusPill>
  ));

const scope = (row: OverviewRow) =>
  row.record ?? <span className="whitespace-nowrap">All records</span>;

/**
 * The standard assignments table of one person or group (person-access.prototype.html,
 * `d8l5.61`): Role, Scope and Assigned via, with "Assigned <date> by <name>" under the role, and
 * the same facts as label and value rows on a phone. Every row of a group is Direct, so a group's
 * table has no Assigned via column. Active is the normal case, so only Paused shows (G9).
 */
export function AssignmentsTable(props: AssignmentsTableProps): ReactNode {
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
        Loading roles…
      </p>
    );
  }

  // A sheet's rows say Direct or the group's name, so no group size is needed.
  const rows = overviewRows({
    subject: props.recipient,
    paths: props.paths,
    personPaths: props.recipient.type === "user" ? props.paths : undefined,
    catalogue: props.catalogue,
    memberCounts: {},
    recordLabels: props.recordLabels,
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        title={props.empty.title}
        description={props.empty.description}
      />
    );
  }

  const role = (row: OverviewRow) => {
    const href = props.roleHref?.(row.roleId);

    return href === undefined ? (
      row.role
    ) : (
      <PageLink
        href={href}
        className={`font-medium text-foreground underline ${focusRing}`}
      >
        {row.role}
      </PageLink>
    );
  };

  // "Direct", or the group with its kind after it, as the prototype draws "Finance team (group)".
  const via = (row: OverviewRow) => {
    if (row.holder.id === props.recipient.id) return "Direct";

    const href = props.groupHref?.(row.holder.id);

    return (
      <>
        {href === undefined ? (
          row.holder.name
        ) : (
          <PageLink
            href={href}
            className={`font-medium text-foreground underline ${focusRing}`}
          >
            {row.holder.name}
          </PageLink>
        )}
        <span className="text-muted-foreground"> (group)</span>
      </>
    );
  };

  const person = props.recipient.type === "user";

  const viaColumn: DataTableColumn<OverviewRow> = {
    id: "via",
    header: "Assigned via",
    cell: via,
  };

  return (
    <DataTable
      label="Assigned roles"
      rows={rows}
      rowKey={(row) => row.key}
      rowLabel={(row) => row.role}
      columns={[
        {
          id: "role",
          header: "Role",
          cell: (row) => (
            <span className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                {role(row)}
                {paused(row)}
              </span>
              <span className="text-xs text-muted-foreground">
                {assignedLabel(row, props.timeZone)}
              </span>
            </span>
          ),
        },
        { id: "scope", header: "Scope", cell: scope },
        ...(person ? [viaColumn] : []),
      ]}
      card={{
        title: role,
        badge: (row) =>
          row.notInEffect.length === 0 ? null : <>{paused(row)}</>,
        content: (row) => (
          // oxlint-disable-next-line shadcn/no-arbitrary-values -- the design capture's label column takes the label's width, not a fraction
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Scope</dt>
            <dd className="min-w-0 wrap-anywhere">{scope(row)}</dd>
            {person ? (
              <>
                <dt className="text-muted-foreground">Assigned via</dt>
                <dd className="min-w-0 wrap-anywhere">{via(row)}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Assigned</dt>
            <dd className="min-w-0">{assignedOn(row, props.timeZone)}</dd>
          </dl>
        ),
      }}
    />
  );
}
