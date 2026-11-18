"use client";

import {
  Button,
  EmptyState,
  IconTile,
  LabelPill,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  StatusPill,
} from "@genie/ui";
import { ArrowRightIcon, BlocksIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import type { AccessPage } from "../../services/roles/effective-access.ts";
import type { RecipientPage } from "../../services/roles/recipients.ts";
import { PlusIcon } from "../admin/icons.tsx";
import {
  AddAssignmentForm,
  type AddAssignmentHost,
} from "./add-assignment-form.tsx";
import { assignedLabel } from "./assignment-words.ts";
import { overviewRows, pausedLabel } from "./overview-view.ts";
import { RecipientMark } from "./recipient-mark.tsx";

/**
 * A module's sheet on Modules (P12-16, d8l5.62): who it is assigned to, newest first, the newest 25
 * and the total, Add assignment with the module's roles, and Manage in Access for the rest. Only a
 * tenant-wide roles manager reaches it (P12-2). A module that is off offers no Add assignment,
 * because none of its roles can be added (R-37a).
 */
export function ModuleSheet(props: {
  readonly open: boolean;
  /** The module, kept after close so the sheet does not blank during its exit. */
  readonly module: {
    readonly id: string;
    readonly displayName: string;
    readonly description: string | null;
    readonly enabled: boolean;
  };
  readonly onClose: () => void;
  /** `roles.assignments({ moduleId, limit: 25 })`: the newest 25 and the total. Undefined while it loads. */
  readonly page: AccessPage | undefined;
  readonly error?: boolean | undefined;
  /** Record labels by `scopeKey` (AD10). */
  readonly recordLabels: ReadonlyMap<string, string>;
  readonly timeZone: string;
  /** The module's roles only (`roleChoices({ moduleId })`); undefined until they load. */
  readonly host?: AddAssignmentHost | undefined;
  /** `roles.recipients` with `limit: 10`. */
  readonly search: (query: string) => Promise<RecipientPage>;
  /** The viewer: their own row is disabled in Assign to (P12-3). */
  readonly selfId: string;
  /** Opens the Overview filtered to this module (P12-10). */
  readonly onManageAccess: () => void;
}): ReactNode {
  const { module } = props;
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRows, setNewRows] = useState<ReadonlySet<string>>(new Set());

  // The sheet stays mounted, so each open starts on the list.
  useEffect(() => {
    setAdding(false);
    setNewRows(new Set());
  }, [props.open, module.id]);

  const host = module.enabled ? props.host : undefined;

  const total =
    props.page === undefined
      ? undefined
      : (props.page.total ?? props.page.paths.length);

  const rows =
    props.page === undefined
      ? []
      : overviewRows({
          subject: { type: "module", id: module.id },
          paths: props.page.paths,
          personPaths: undefined,
          catalogue: [],
          memberCounts: props.page.memberCounts,
          recordLabels: props.recordLabels,
        });

  const onOpenChange = (next: boolean) => {
    if (!next && !saving) props.onClose();
  };

  const addButton = (primary: boolean) =>
    host === undefined ? undefined : (
      <Button
        variant={primary ? "primary" : "secondary"}
        onClick={() => setAdding(true)}
      >
        <PlusIcon aria-hidden="true" />
        Add assignment
      </Button>
    );

  if (adding && host !== undefined) {
    const defaultRoleId = host.roles
      .flatMap((group) => group.choices)
      .find((choice) => choice.isDefault)?.roleId;

    return (
      <Sheet open={props.open} onOpenChange={onOpenChange}>
        <SheetContent showCloseButton={false}>
          <SheetTitle className="sr-only">{module.displayName}</SheetTitle>
          <AddAssignmentForm
            // `initialRoleId` is read once: a new role list starts a new form.
            key={host.roles
              .flatMap((group) => group.choices.map((choice) => choice.roleId))
              .join()}
            to={{ search: props.search, selfId: props.selfId }}
            roles={host.roles}
            initialRoleId={defaultRoleId}
            backTo={module.displayName}
            onSearchRecords={host.onSearchRecords}
            onCancel={() => setAdding(false)}
            onSubmit={async (input) => {
              setSaving(true);

              try {
                const result = await host.onSubmit(input);

                setNewRows(
                  new Set(result.added.map((added) => added.assignmentId))
                );
                setAdding(false);
              } finally {
                setSaving(false);
              }
            }}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={props.open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <div className="flex items-start gap-3">
            <IconTile>
              <BlocksIcon aria-hidden="true" />
            </IconTile>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {/* oxlint-disable-next-line shadcn/no-restyle -- P07-51: a 40 px title line centers the 40 px tile, as the group sheet does */}
                <SheetTitle className="min-w-0 wrap-anywhere leading-10">
                  {module.displayName}
                </SheetTitle>
                <StatusPill tone={module.enabled ? "success" : "neutral"}>
                  {module.enabled ? "Module on" : "Module off"}
                </StatusPill>
              </div>
              {module.description === null ? null : (
                <p className="text-sm text-muted-foreground">
                  {module.description}
                </p>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              Assigned to{total === undefined ? "" : ` (${total})`}
            </h3>
            {total !== undefined && total > 0 ? addButton(false) : null}
          </div>

          {props.error === true ? (
            <p
              role="alert"
              className="text-sm text-destructive dark:text-destructive-on-dark"
            >
              The assignments could not be read.
            </p>
          ) : props.page === undefined ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading assignments
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Not assigned to anyone"
              description={`No one can open ${module.displayName} until a role is assigned.`}
              action={addButton(true)}
            />
          ) : (
            <ul
              aria-label="Assigned to"
              className="divide-y divide-border rounded-lg border border-border"
            >
              {rows.map((row) => (
                <li
                  key={row.key}
                  data-new={newRows.has(row.key) ? "" : undefined}
                  className="flex items-start gap-3 p-3 data-new:bg-primary/5"
                >
                  <RecipientMark
                    type={row.holder.type}
                    name={row.holder.name}
                  />
                  {/* 8 px down, so the 32 px mark's center sits on the first line's center (6wz1.113). */}
                  <div className="flex min-w-0 flex-col pt-2">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium">
                        {row.holder.name}
                      </span>
                      {row.record === null ? null : (
                        <LabelPill>{`One record · ${row.record}`}</LabelPill>
                      )}
                      {row.notInEffect.map((reason) => (
                        <StatusPill key={reason} tone="warning">
                          {pausedLabel(reason)}
                        </StatusPill>
                      ))}
                    </span>
                    <span className="text-sm">
                      {row.role}
                      {row.custom ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · Custom role
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.kind}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {assignedLabel(row, props.timeZone)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div>
            <Button variant="link" size="sm" onClick={props.onManageAccess}>
              Manage in Access <ArrowRightIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
