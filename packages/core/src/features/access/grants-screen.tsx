"use client";

import {
  Button,
  ConfirmDialog,
  EmptyState,
  FormActionBar,
  HelpDisclosure,
  StatusPill,
  ToggleGroup,
  ToggleGroupItem,
  TransferList,
  type TransferItem,
  useMediaQuery,
} from "@genie/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useStore } from "zustand";

import type {
  AccessPath,
  AccessRecipient,
} from "../../services/roles/effective-access.ts";
import type {
  GrantChanges,
  GrantRecipients,
  GrantRow,
} from "../../services/roles/grants.ts";
import {
  createGrantsDraftStore,
  draftCounts,
  type GrantsDraft,
} from "./grants-draft-store.ts";
import {
  grantsView,
  type GrantsView,
  linkDraft,
  removalOf,
  saveInput,
} from "./grants-view.ts";
import { RecipientPicker } from "./recipient-picker.tsx";
import {
  RemoveAccessDialog,
  type RowRemoval,
} from "./remove-access-dialog.tsx";
import { RoleChoice } from "./role-choice.tsx";

export type GrantsScreenProps = {
  readonly catalogue: readonly GrantRow[] | undefined;
  readonly recipients: GrantRecipients | undefined;
  readonly recipient: AccessRecipient | null;
  readonly onRecipientChange: (next: AccessRecipient | null) => void;
  /** The chosen recipient's paths, undefined while they load. */
  readonly paths: readonly AccessPath[] | undefined;
  /** A prefilled link, applied once on the first recipient (P17). */
  readonly link?: {
    readonly module?: string | undefined;
    readonly role?: string | undefined;
  };
  /** Rejects with `{ message }` when the server refuses. The screen keeps the draft. */
  readonly onSave: (changes: GrantChanges) => Promise<void>;
  /** A failed read. */
  readonly error?: string;
};

type Kind = AccessRecipient["type"];

const EMPTY_COPY = {
  group: {
    title: "Choose a group",
    description:
      "A group is the normal path. Your identity provider keeps its members current, so access follows people when they join or leave.",
  },
  user: {
    title: "Choose a person",
    description:
      "A person is the exception. Use it when one person needs a module that their groups do not give.",
  },
} as const;

const REFUSAL = z.object({ message: z.string().min(1) });

const KIND_LABEL = { group: "Groups", user: "People" } as const;

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

const offReason = (row: GrantRow) =>
  `${row.name} is switched off for this deployment.`;

function nameOf(
  recipient: AccessRecipient,
  recipients: GrantRecipients | undefined
): string {
  const list =
    recipient.type === "group" ? recipients?.groups : recipients?.people;

  return list?.find((entry) => entry.id === recipient.id)?.name ?? "";
}

/** "Tenant administrator (Core administration, whole tenant)" (P4). */
function notShownLabel(
  path: AccessPath,
  catalogue: readonly GrantRow[]
): string {
  const owner =
    catalogue.find((row) => row.roles.some((role) => role.id === path.role.id))
      ?.name ??
    catalogue.find((row) => row.id === path.role.moduleId)?.name ??
    "Core administration";

  return `${path.role.name} (${owner}, ${path.scope === null ? "whole tenant" : "one record"})`;
}

/** A transfer row while it is built, so each optional field is added only when present. */
type DraftItem = { -readonly [K in keyof TransferItem]: TransferItem[K] };

/** The transfer rows: the catalogue in order, each with its staged state (P2, P3). */
function itemsOf(input: {
  readonly catalogue: readonly GrantRow[];
  readonly view: GrantsView;
  readonly draft: GrantsDraft;
  readonly granted: ReadonlySet<string>;
  readonly setRole: (row: string, roleId: string, saved?: string) => void;
}): TransferItem[] {
  return input.catalogue.map((row) => {
    const shown = input.view.granted.find((entry) => entry.row.id === row.id);

    const also =
      input.view.catalog.find((entry) => entry.row.id === row.id)
        ?.alsoThrough ?? [];

    const staged =
      row.id in input.draft.add ||
      row.id in input.draft.change ||
      input.draft.remove.includes(row.id);

    const value =
      input.draft.add[row.id] ??
      input.draft.change[row.id] ??
      shown?.shown.role.id ??
      row.defaultRoleId ??
      "";

    const savedRoleId =
      row.id in input.draft.add ? undefined : shown?.shown.role.id;

    const description = row.enabled
      ? row.description
      : `Inactive, the ${row.name} module is off`;

    const item: DraftItem = {
      id: row.id,
      label: row.name,
      group: row.group === "core" ? "Core" : "Modules",
      pills: (
        <>
          {row.enabled ? null : (
            <StatusPill tone="warning">Inactive</StatusPill>
          )}
          {staged ? <StatusPill tone="neutral">Pending</StatusPill> : null}
        </>
      ),
      control: (
        <RoleChoice
          rowName={row.name}
          roles={row.roles}
          defaultRoleId={row.defaultRoleId}
          value={value}
          {...(savedRoleId === undefined ? {} : { savedRoleId })}
          {...(row.enabled ? {} : { disabledReason: offReason(row) })}
          onChange={(roleId) => input.setRole(row.id, roleId, savedRoleId)}
        />
      ),
    };

    if (description !== null) item.description = description;

    if (!row.enabled) item.blockedReason = offReason(row);

    if (also.length > 0 && !input.granted.has(row.id)) {
      item.note = `Also through ${also.join(", ")}`;
    }

    return item;
  });
}

/** "1 to add, 2 to remove", without the zero parts. */
function countsLine(draft: GrantsDraft): string {
  const counts = draftCounts(draft);

  return [
    counts.add > 0 ? `${counts.add} to add` : null,
    counts.change > 0 ? `${counts.change} to change` : null,
    counts.remove > 0 ? `${counts.remove} to remove` : null,
  ]
    .filter((part) => part !== null)
    .join(", ");
}

/**
 * The Grants tab of Access (R-37a). An administrator picks a group, or a person as the exception,
 * moves module rows between Catalog and Granted, picks the role of each Granted row, and saves
 * once. Every Remove confirms first. A refused save keeps every staged change on the screen.
 */
export function GrantsScreen(props: GrantsScreenProps): ReactNode {
  const [store] = useState(createGrantsDraftStore);
  const draft = useStore(store, (state) => state);

  const [kind, setKind] = useState<Kind>(props.recipient?.type ?? "group");

  const [confirmRemove, setConfirmRemove] = useState(false);

  const [pendingSwitch, setPendingSwitch] = useState<{
    readonly label: string;
    readonly apply: () => void;
  } | null>(null);

  const [saving, setSaving] = useState(false);

  const [failure, setFailure] = useState<string | null>(null);

  const linkApplied = useRef(false);

  const panes = useMediaQuery("(min-width: 1280px)", { noSsr: true });

  const catalogue = props.catalogue ?? [];

  const view =
    props.recipient === null || props.paths === undefined
      ? null
      : grantsView({
          catalogue,
          paths: props.paths,
          recipient: props.recipient,
        });

  // A prefilled link stages its change once, on the first recipient whose paths arrive (P17).
  useEffect(() => {
    if (linkApplied.current || view === null || props.link === undefined) {
      return;
    }

    linkApplied.current = true;
    store.getState().reset(linkDraft(view, props.link));
  }, [view, props.link, store]);

  const counts = draftCounts(draft);

  const total = counts.add + counts.change + counts.remove;

  const name =
    props.recipient === null ? "" : nameOf(props.recipient, props.recipients);

  /** A switch drops the draft, so a dirty draft asks first. */
  const guardSwitch = (label: string, apply: () => void) => {
    if (total === 0) {
      apply();

      return;
    }

    setPendingSwitch({ label, apply });
  };

  const clear = () => {
    store.getState().reset();
    setFailure(null);
  };

  const switchKind = (next: Kind) =>
    guardSwitch(KIND_LABEL[next], () => {
      clear();
      setKind(next);
      props.onRecipientChange(null);
    });

  const pick = (next: AccessRecipient) => {
    if (next.id === props.recipient?.id) return;

    guardSwitch(nameOf(next, props.recipients), () => {
      clear();
      props.onRecipientChange(next);
    });
  };

  const removals = (): RowRemoval[] =>
    props.recipient === null || props.paths === undefined
      ? []
      : draft.remove.flatMap((rowId) => {
          const row = catalogue.find((candidate) => candidate.id === rowId);

          return row === undefined || props.recipient === null
            ? []
            : [
                {
                  rowName: row.name,
                  ...removalOf(row, props.paths ?? [], props.recipient),
                },
              ];
        });

  const save = async () => {
    if (view === null) return;

    setConfirmRemove(false);
    setFailure(null);
    setSaving(true);

    // The rows stay editable while the save runs, so only what it sent is cleared after it.
    const sent = { add: draft.add, change: draft.change, remove: draft.remove };

    try {
      await props.onSave(saveInput(view, sent));
      store.getState().clearSaved(sent);
    } catch (error) {
      // The route rejects with its refusal, a plain object that carries the whole message.
      const refusal = REFUSAL.safeParse(error);

      setFailure(
        refusal.success
          ? refusal.data.message
          : "The access changes were not saved."
      );
    } finally {
      setSaving(false);
    }
  };

  const firstStay = removals()[0]?.pathsThatStay.find(
    (path) => path.holder.type === "group"
  );

  const granted = new Set([
    ...(view?.granted ?? [])
      .map((entry) => entry.row.id)
      .filter((row) => !draft.remove.includes(row)),
    ...Object.keys(draft.add),
  ]);

  return (
    <div className="flex flex-col gap-4">
      {/* A save in flight freezes the recipient and the rows: an edit made now would race the write. */}
      <div
        inert={saving}
        className="flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        <span
          id="grants-grant-to"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Grant to
        </span>
        <ToggleGroup<Kind>
          aria-labelledby="grants-grant-to"
          value={[kind]}
          onValueChange={(values) => {
            // A second press on the pressed segment empties the value: keep the segment.
            const [next] = values;

            if (next !== undefined && next !== kind) switchKind(next);
          }}
        >
          <ToggleGroupItem value="group">Groups</ToggleGroupItem>
          <ToggleGroupItem value="user">People</ToggleGroupItem>
        </ToggleGroup>
        {props.recipients === undefined ? null : (
          <div className="w-full md:w-96">
            <RecipientPicker
              kind={kind}
              recipients={props.recipients}
              value={props.recipient}
              onPick={pick}
            />
          </div>
        )}
      </div>

      {props.error === undefined ? null : (
        <p role="alert" className="text-sm text-destructive">
          {props.error}
        </p>
      )}

      {props.recipient === null ? (
        <EmptyState
          variant="framed"
          title={EMPTY_COPY[kind].title}
          description={EMPTY_COPY[kind].description}
        />
      ) : (
        <section
          inert={saving}
          aria-labelledby="grants-heading"
          className="flex flex-col rounded-xl border border-border bg-card"
        >
          <div className="flex flex-col gap-2 p-5 lg:p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 id="grants-heading" className="text-lg font-semibold">
                Modules and roles
              </h2>
              <HelpDisclosure label="How access works">
                <p>
                  Each module has its own roles. Holding any role of a module
                  gives access to it. Add gives the module&apos;s default role,
                  and the choice on each Granted row changes it.
                </p>
                <p>
                  Access adds up. A person reaches a module directly and through
                  each of their groups. Removing one path leaves the others, and
                  no rule denies access.
                </p>
                <p>
                  A switched-off module keeps its grants and takes no new one.
                </p>
              </HelpDisclosure>
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">
              For {name}. Move rows, pick a role on each Granted row, then save.
              Granted means a role exists, not that the module works today: it
              applies while the module is on.
            </p>
          </div>

          {view === null ? (
            <p
              role="status"
              className="px-5 pb-6 text-sm text-muted-foreground"
            >
              Loading the access of {name}…
            </p>
          ) : (
            <div className="flex flex-col gap-3 px-5 pb-5 max-xl:px-0 lg:px-6 xl:pb-6">
              <div className="max-xl:mx-5 max-xl:overflow-clip max-xl:rounded-lg max-xl:border max-xl:border-border lg:max-xl:mx-6">
                <TransferList
                  key={`${props.recipient.type}:${props.recipient.id}`}
                  layout={panes ? "panes" : "roster"}
                  items={itemsOf({
                    catalogue,
                    view,
                    draft,
                    granted,
                    setRole: (row, roleId, saved) =>
                      store.getState().setRole(row, roleId, saved),
                  })}
                  granted={granted}
                  onMove={(ids, to) => {
                    if (to === "available") {
                      store.getState().stageRemove(ids);

                      return;
                    }

                    store.getState().stageAdd(
                      ids.flatMap((id) => {
                        const row = catalogue.find((entry) => entry.id === id);

                        return row?.defaultRoleId == null
                          ? []
                          : [{ row: id, roleId: row.defaultRoleId }];
                      })
                    );
                  }}
                  availableLabel="Catalog"
                  grantedLabel="Granted"
                  emptyAvailable="Every module is granted."
                  emptyGranted="Nothing granted yet. Add rows from Catalog."
                  searchLabel="Search modules"
                />
              </div>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground max-xl:px-5 lg:max-xl:px-6">
                {props.recipient.type === "user" ? (
                  <p>
                    This screen writes the roles given to {name} directly. Group
                    paths change on Groups.
                  </p>
                ) : null}
                {view.notShown.length === 0 ? null : (
                  <p>
                    Not shown here:{" "}
                    {view.notShown
                      .map((path) => notShownLabel(path, catalogue))
                      .join(", ")}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {total === 0 || props.recipient === null ? null : (
        <div
          role="region"
          aria-label="Unsaved changes"
          className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-border bg-card px-4 py-3 md:mx-0 md:flex-row md:items-center md:justify-between md:gap-6 md:rounded-xl md:border md:px-5"
        >
          <div className="flex shrink-0 flex-col gap-0.5 text-sm">
            <p className="font-semibold">{plural(total, "unsaved change")}</p>
            <p className="text-xs text-muted-foreground">{countsLine(draft)}</p>
            {firstStay === undefined ? null : (
              <p className="text-xs text-muted-foreground">
                {firstStay.role.name} through {firstStay.holder.name} stays.
              </p>
            )}
          </div>
          <div className="md:flex-1">
            <FormActionBar failure={failure}>
              <Button variant="secondary" disabled={saving} onClick={clear}>
                Cancel
              </Button>
              <Button
                loading={saving}
                onClick={() => {
                  if (draft.remove.length > 0) setConfirmRemove(true);
                  else void save();
                }}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </FormActionBar>
          </div>
        </div>
      )}

      {props.recipient === null ? null : (
        <RemoveAccessDialog
          open={confirmRemove}
          recipient={{ type: props.recipient.type, name }}
          removals={confirmRemove ? removals() : []}
          onConfirm={() => void save()}
          onClose={() => setConfirmRemove(false)}
        />
      )}

      <ConfirmDialog
        open={pendingSwitch !== null}
        title={`Discard ${plural(total, "unsaved change")}?`}
        description={`Switching to ${pendingSwitch?.label ?? ""} drops the changes for ${name}.`}
        confirmLabel="Discard"
        danger
        onConfirm={() => {
          pendingSwitch?.apply();
          setPendingSwitch(null);
        }}
        onClose={() => setPendingSwitch(null)}
      />
    </div>
  );
}
