"use client";

import {
  Button,
  ConfirmDialog,
  focusRing,
  FormActionBar,
  iconLeadPx,
  LabelPill,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  touchAreas,
  TransferList,
  type TransferItem,
  useMediaQuery,
} from "@genie/ui";
import { ArrowLeftIcon, SlidersHorizontalIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import type {
  AdvancedCatalogue,
  AdvancedChanges,
  RemovalGuard,
} from "../../services/roles/advanced.ts";
import type { AccessPath } from "../../services/roles/effective-access.ts";
import type { GrantChanges, GrantRow } from "../../services/roles/grants.ts";
import type {
  RecipientPage,
  RecipientRow,
} from "../../services/roles/recipients.ts";
import type { ScopeRecord } from "../../services/roles/records.ts";
import { AccessHelp } from "./access-help.tsx";
import { AdvancedAccessSheet } from "./advanced-access-sheet.tsx";
import {
  type AdvancedAdd,
  advancedLinkAdd,
  scopeKey,
} from "./advanced-view.ts";
import {
  createGrantsDraftStore,
  draftCounts,
  type GrantsDraft,
} from "./grants-draft-store.ts";
import { GrantsList, type GrantsListProps } from "./grants-list.tsx";
import {
  grantsView,
  type GrantsView,
  type InheritedRowView,
  type InheritedSource,
  linkDraft,
  ownsRole,
  REFUSAL,
  removalOf,
  saveInput,
} from "./grants-view.ts";
import { pausedLabel, reasonLabel } from "./overview-view.ts";
import { RecipientField } from "./recipient-field.tsx";
import {
  RemoveAccessDialog,
  type RowRemoval,
} from "./remove-access-dialog.tsx";
import { RoleChoice } from "./role-choice.tsx";
import { UnsavedMark } from "./unsaved-mark.tsx";

export type GrantsScreenProps = {
  readonly catalogue: readonly GrantRow[] | undefined;
  readonly recipient: RecipientRow | null;
  readonly onRecipientChange: (next: RecipientRow | null) => void;
  /** The Grant to field's search: `roles.recipients` with `limit: 10`. */
  readonly search: (query: string) => Promise<RecipientPage>;
  /** One recipient by id, archived groups too, or null (`roles.recipients({ ids: [id], archived: true, limit: 1 })`). */
  readonly lookup: (id: string) => Promise<RecipientRow | null>;
  /** The list shown while no recipient is chosen. */
  readonly list: Omit<GrantsListProps, "onOpen">;
  /** The chosen recipient's paths, undefined while they load. */
  readonly paths: readonly AccessPath[] | undefined;
  /**
   * A prefilled link. `recipient` opens that recipient once through `lookup`; an id that no read
   * holds shows the list (LK1). `module` and `role` stage their change once, on the first
   * recipient (P17).
   */
  readonly link?: {
    readonly recipient?: string | undefined;
    readonly module?: string | undefined;
    readonly role?: string | undefined;
  };
  /** Rejects with `{ message }` when the server refuses. The screen keeps the draft. */
  readonly onSave: (changes: GrantChanges) => Promise<void>;
  /** The reads and writes of Advanced access (R-37c). */
  readonly advanced: {
    readonly catalogue: AdvancedCatalogue | undefined;
    /** The chosen recipient's guarded removals, undefined while they load. */
    readonly guards: readonly RemovalGuard[] | undefined;
    readonly onSave: (changes: AdvancedChanges) => Promise<void>;
    readonly onSearchRecords: (
      recordType: string,
      query: string
    ) => Promise<readonly ScopeRecord[]>;
  };
  /** Record labels by `scopeKey`, only for records the caller can open (AD10). */
  readonly recordLabels: ReadonlyMap<string, string>;
  /** A failed read. */
  readonly error?: string;
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

const offReason = (row: GrantRow) => `${row.name} is off for this deployment.`;

/** A transfer row while it is built, so each optional field is added only when present. */
type DraftItem = { -readonly [K in keyof TransferItem]: TransferItem[K] };

const inheritedId = (entry: InheritedRowView) =>
  `inherited:${entry.path.assignmentId}:${entry.row.id}`;

/** The caption a catalogue row sits under: also an option of the Show filter (P08-4). */
const groupOf = (row: GrantRow): string =>
  row.group === "core" ? "Core" : "Modules";

/** The Show value for every caption. */
const SHOW_ALL = "all";

/** The "One record · <label>" pill of a scoped assignment, or nothing for the whole tenant. */
function recordPill(
  path: AccessPath,
  recordLabels: ReadonlyMap<string, string>
): ReactNode {
  if (path.scope === null) return null;

  const record = recordLabels.get(scopeKey(path.scope)) ?? path.scope.id;

  return (
    <LabelPill>
      <span className="wrap-anywhere">{`One record · ${record}`}</span>
    </LabelPill>
  );
}

/** Opens Advanced access, where a role that Grants cannot edit is changed. */
function advancedButton(onOpenAdvanced: () => void): ReactNode {
  return (
    <button
      type="button"
      className={`font-medium text-foreground underline ${touchAreas.md} ${focusRing}`}
      onClick={onOpenAdvanced}
    >
      Change in Advanced access
    </button>
  );
}

/**
 * One read-only Granted row for a path that is not the editable one (d8l5.42): "Assigned via
 * <group>" opens the group on Grants, "Assigned via <role> (role)" opens Advanced access. A
 * direct role that the row owns is no route and reads "<role> · Direct" (P11-34). The role and
 * its route sit in one control line (d8l5.60): at the row end in panes, under the description
 * when stacked.
 */
function inheritedItem(
  entry: InheritedRowView,
  input: {
    readonly recordLabels: ReadonlyMap<string, string>;
    readonly onOpenSource: (source: InheritedSource) => void;
    readonly onOpenAdvanced: () => void;
  }
): TransferItem {
  const { row, path, source } = entry;

  // A direct path of a role that the row itself owns is a direct role, not a route (P11-34).
  const directRole = source.kind === "role" && ownsRole(row, path.role.id);

  const sourceButton = (
    <button
      type="button"
      className={`font-medium text-foreground underline ${touchAreas.md} ${focusRing}`}
      onClick={() => input.onOpenSource(source)}
    >
      {source.name}
    </button>
  );

  const item: DraftItem = {
    id: inheritedId(entry),
    label: row.name,
    group: groupOf(row),
    countKey: row.id,
    readOnly: true,
    control: (
      <span className="text-xs text-muted-foreground">
        {source.kind === "group" ? (
          <>
            {path.role.name} · Assigned via {sourceButton}
          </>
        ) : directRole ? (
          <>
            {path.role.name} · Direct · {advancedButton(input.onOpenAdvanced)}
          </>
        ) : (
          <>Assigned via {sourceButton} (role)</>
        )}
      </span>
    ),
    pills: (
      <>
        {row.enabled ? null : (
          <StatusPill tone="warning">Paused: Module off</StatusPill>
        )}
        {recordPill(path, input.recordLabels)}
      </>
    ),
  };

  if (row.description !== null) item.description = row.description;

  return item;
}

const rowlessId = (path: AccessPath) => `rowless:${path.assignmentId}`;

/** A read-only row for a direct role that opens no module, such as Auditor (A-2). */
function rowlessItem(
  path: AccessPath,
  input: {
    readonly onOpenAdvanced: () => void;
    readonly recordLabels: ReadonlyMap<string, string>;
  }
): TransferItem {
  return {
    id: rowlessId(path),
    label: path.role.name,
    group: path.role.moduleId === null ? "Core" : "Modules",
    countKey: rowlessId(path),
    readOnly: true,
    control: (
      <span className="text-xs text-muted-foreground">
        Direct · {advancedButton(input.onOpenAdvanced)}
      </span>
    ),
    pills: (
      <>
        {path.notInEffect.map((reason) => (
          <StatusPill key={reason} tone="warning">
            {pausedLabel(reasonLabel(reason))}
          </StatusPill>
        ))}
        {recordPill(path, input.recordLabels)}
      </>
    ),
  };
}

/** The transfer rows: the catalogue in order, each with its staged state (P2, P3), then its read-only paths. */
function itemsOf(input: {
  readonly catalogue: readonly GrantRow[];
  readonly view: GrantsView;
  readonly draft: GrantsDraft;
  readonly granted: ReadonlySet<string>;
  readonly setRole: (row: string, roleId: string, saved?: string) => void;
  readonly recordLabels: ReadonlyMap<string, string>;
  readonly onOpenSource: (source: InheritedSource) => void;
  readonly onOpenAdvanced: () => void;
}): TransferItem[] {
  return [
    ...input.catalogue.flatMap((row) => {
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

      // A module that is off: "Module off" in Catalog, "Paused: Module off" on a Granted assignment (G6, G9).
      const offPill = input.granted.has(row.id) ? (
        <StatusPill tone="warning">Paused: Module off</StatusPill>
      ) : (
        <StatusPill tone="neutral">Module off</StatusPill>
      );

      const item: DraftItem = {
        id: row.id,
        label: row.name,
        group: groupOf(row),
        pills: (
          <>
            {row.enabled ? null : offPill}
            {staged ? (
              <UnsavedMark removal={input.draft.remove.includes(row.id)} />
            ) : null}
          </>
        ),
        control: (
          <span className="flex flex-col items-start gap-1">
            <RoleChoice
              rowName={row.name}
              roles={row.roles}
              defaultRoleId={row.defaultRoleId}
              value={value}
              {...(savedRoleId === undefined ? {} : { savedRoleId })}
              {...(row.enabled ? {} : { disabledReason: offReason(row) })}
              onChange={(roleId) => input.setRole(row.id, roleId, savedRoleId)}
            />
            <span className="text-xs text-muted-foreground">Direct</span>
          </span>
        ),
      };

      if (row.description !== null) item.description = row.description;

      if (!row.enabled) item.blockedReason = offReason(row);

      if (also.length > 0 && !input.granted.has(row.id)) {
        item.note = `Also assigned via ${also.join(", ")}`;
      }

      return [
        item,
        ...input.view.inherited
          .filter((entry) => entry.row.id === row.id)
          .map((entry) => inheritedItem(entry, input)),
      ];
    }),
    ...input.view.rowless.map((path) => rowlessItem(path, input)),
  ];
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
 * The Grants tab of Access (R-37a, P12-17). With no recipient it lists every group and person; a
 * row opens its editor. One Grant to field changes the recipient, and "All groups and people"
 * returns to the list, each behind the unsaved-changes confirm. The editor moves module rows
 * between Catalog and Granted, picks the role of each Granted row, and saves once. Every Remove
 * confirms first. A refused save keeps every staged change.
 */
export function GrantsScreen(props: GrantsScreenProps): ReactNode {
  const [store] = useState(createGrantsDraftStore);
  const draft = useStore(store, (state) => state);

  // An address link opens once; until its lookup answers, neither the list nor the editor shows.
  const [opening, setOpening] = useState(
    () => props.link?.recipient !== undefined
  );

  const [lookupFailed, setLookupFailed] = useState(false);

  const [confirmRemove, setConfirmRemove] = useState(false);

  const [pendingSwitch, setPendingSwitch] = useState<{
    readonly label: string;
    readonly apply: () => void;
  } | null>(null);

  const [saving, setSaving] = useState(false);

  const [failure, setFailure] = useState<string | null>(null);

  const linkApplied = useRef(false);

  const recipientLinkApplied = useRef(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [advancedAdd, setAdvancedAdd] = useState<AdvancedAdd | undefined>();

  const [shownGroup, setShownGroup] = useState(SHOW_ALL);

  const panes = useMediaQuery("(min-width: 1280px)", { noSsr: true });

  const wide = useMediaQuery("(min-width: 768px)", { noSsr: true });

  const catalogue = props.catalogue ?? [];

  const groups = [...new Set(catalogue.map(groupOf))];

  // A caption that the new recipient's catalogue lacks shows everything.
  const shown = groups.includes(shownGroup) ? shownGroup : SHOW_ALL;

  const view =
    props.recipient === null || props.paths === undefined
      ? null
      : grantsView({
          catalogue,
          paths: props.paths,
          recipient: props.recipient,
        });

  const advancedCatalogue = props.advanced.catalogue;

  // An address link opens its recipient once (LK1). An id that no read holds shows the list.
  const linkedId = props.link?.recipient;

  const { lookup, onRecipientChange } = props;

  useEffect(() => {
    if (recipientLinkApplied.current || linkedId === undefined) return;

    recipientLinkApplied.current = true;

    void lookup(linkedId)
      .then(
        (row) => {
          if (row !== null) onRecipientChange(row);
        },
        () => setLookupFailed(true)
      )
      .finally(() => setOpening(false));
  }, [linkedId, lookup, onRecipientChange]);

  // A prefilled link stages its change once, on the first recipient whose paths arrive (P17). A
  // core role link that Grants cannot stage waits for the Advanced catalogue, then opens Advanced
  // access with the role staged (AD12).
  useEffect(() => {
    if (linkApplied.current || view === null || props.link === undefined) {
      return;
    }

    const staged = linkDraft(view, props.link);

    const { recipient } = props;

    const grantsStaged =
      Object.keys(staged.add).length + Object.keys(staged.change).length > 0;

    if (grantsStaged || props.link.role === undefined || recipient === null) {
      linkApplied.current = true;
      store.getState().reset(staged);

      return;
    }

    if (advancedCatalogue === undefined) return;

    linkApplied.current = true;

    const add = advancedLinkAdd({
      catalogue: advancedCatalogue,
      held: new Set(
        (props.paths ?? []).flatMap((path) =>
          path.scope === null &&
          path.holder.type === recipient.type &&
          path.holder.id === recipient.id
            ? [path.role.id]
            : []
        )
      ),
      roleId: props.link.role,
    });

    if (add !== null) {
      setAdvancedAdd(add);
      setAdvancedOpen(true);
    }
  }, [
    view,
    props.link,
    props.paths,
    props.recipient,
    advancedCatalogue,
    store,
  ]);

  const counts = draftCounts(draft);

  const total = counts.add + counts.change + counts.remove;

  const name = props.recipient?.name ?? "";

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

  const closeAdvanced = () => {
    setAdvancedOpen(false);
    setAdvancedAdd(undefined);
  };

  const pick = (next: RecipientRow) => {
    if (next.type === props.recipient?.type && next.id === props.recipient.id)
      return;

    guardSwitch(next.name, () => {
      clear();
      closeAdvanced();
      props.onRecipientChange(next);
    });
  };

  /** Back to the list, behind the unsaved-changes confirm. */
  const backToList = () =>
    guardSwitch("All groups and people", () => {
      clear();
      closeAdvanced();
      props.onRecipientChange(null);
    });

  /** A read-only row's source: the group opens on Grants, behind the unsaved-changes confirm. */
  const openSource = (source: InheritedSource) => {
    if (source.kind === "role") {
      setAdvancedOpen(true);

      return;
    }

    guardSwitch(source.name, () => {
      clear();
      closeAdvanced();
      void props.lookup(source.id).then(
        (row) => {
          if (row !== null) props.onRecipientChange(row);
        },
        () => setLookupFailed(true)
      );
    });
  };

  const error =
    props.error ?? (lookupFailed ? "The access could not be read." : undefined);

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
    } catch (thrown) {
      const refusal = REFUSAL.safeParse(thrown);

      setFailure(
        refusal.success
          ? refusal.data.message
          : "The access changes were not saved."
      );
    } finally {
      setSaving(false);
    }
  };

  // P11-35: only a route to someone else keeps the module. The recipient's own role is no stay.
  const firstStay = removals()[0]?.pathsThatStay.find(
    (path) =>
      path.holder.type === "group" &&
      (path.holder.type !== props.recipient?.type ||
        path.holder.id !== props.recipient?.id)
  );

  const granted = new Set([
    ...(view?.granted ?? [])
      .map((entry) => entry.row.id)
      .filter((row) => !draft.remove.includes(row)),
    ...Object.keys(draft.add),
    // Read-only rows always sit in Granted, and nothing moves them.
    ...(view?.inherited ?? []).map(inheritedId),
    ...(view?.rowless ?? []).map(rowlessId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      {error === undefined ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {opening ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading
        </p>
      ) : props.recipient === null ? (
        <GrantsList {...props.list} onOpen={props.onRecipientChange} />
      ) : (
        <>
          {/* A save in flight freezes the recipient and the rows: an edit made now would race the write. */}
          <div inert={saving} className="flex flex-col gap-3">
            <div>
              <Button
                variant="link"
                size="sm"
                className="-ms-3"
                onClick={backToList}
              >
                <ArrowLeftIcon aria-hidden="true" className={iconLeadPx[4]} />
                All groups and people
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span
                aria-hidden="true"
                className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                Grant to
              </span>
              <div className="w-full md:w-96">
                <RecipientField
                  label="Grant to"
                  placeholder="Search groups and people"
                  multiple={false}
                  value={[props.recipient]}
                  onChange={(rows) => {
                    const [row] = rows;

                    if (row !== undefined) pick(row);
                  }}
                  search={props.search}
                />
              </div>
              {/* At the row's end, with its icon, on a phone too (access.prototype.html .toolbar .adv). */}
              <Button
                variant="ghost"
                className="ms-auto"
                onClick={() => setAdvancedOpen(true)}
              >
                <SlidersHorizontalIcon aria-hidden="true" />
                Advanced access
              </Button>
            </div>
          </div>
          <section
            inert={saving}
            aria-labelledby="grants-heading"
            className="flex flex-col rounded-xl border border-border bg-card"
          >
            <div className="flex flex-col gap-2 p-5 lg:p-6">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <h2 id="grants-heading" className="text-lg font-semibold">
                  Access assignments
                </h2>
                <AccessHelp />
                {groups.length > 1 ? (
                  <Select
                    items={[
                      { value: SHOW_ALL, label: "All items" },
                      ...groups.map((group) => ({
                        value: group,
                        label: group,
                      })),
                    ]}
                    value={shown}
                    onValueChange={(value: string | null) => {
                      if (value !== null) setShownGroup(value);
                    }}
                  >
                    <SelectTrigger
                      aria-label="Show"
                      className="w-44 md:ms-auto"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SHOW_ALL}>All items</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group} value={group}>
                          {group}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
              <p className="max-w-prose text-sm text-muted-foreground">
                For {name}. Move modules to Granted, pick a role for each, then
                press Save. A role works only while its module is on.
              </p>
            </div>

            {view === null ? (
              <p
                role="status"
                className="px-5 pb-6 text-sm text-muted-foreground"
              >
                Loading the roles of {name}…
              </p>
            ) : (
              <div className="flex flex-col gap-3 px-5 pb-5 lg:px-6 xl:pb-6">
                <TransferList
                  key={`${props.recipient.type}:${props.recipient.id}`}
                  layout={panes ? "panes" : "stacked"}
                  grantedFirst={!wide}
                  items={itemsOf({
                    catalogue,
                    view,
                    draft,
                    granted,
                    setRole: (row, roleId, saved) =>
                      store.getState().setRole(row, roleId, saved),
                    recordLabels: props.recordLabels,
                    onOpenSource: openSource,
                    onOpenAdvanced: () => setAdvancedOpen(true),
                  })}
                  // Show hides rows inside the list, so a tick it hides still counts (as a search's does).
                  visible={(item) => shown === SHOW_ALL || item.group === shown}
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
                  emptyAvailable="Every module is in Granted."
                  emptyGranted="Nothing in Granted yet. Add modules from Catalog."
                />
              </div>
            )}
          </section>
        </>
      )}

      {total === 0 || props.recipient === null ? null : (
        <div
          role="region"
          aria-label="Unsaved changes"
          data-shell-bottom-bar=""
          className="z-10 flex flex-col gap-3 border-t border-border bg-card px-4 py-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 md:sticky md:-bottom-8 md:flex-row md:items-center md:justify-between md:gap-6 md:rounded-xl md:border md:px-5"
        >
          <div className="flex shrink-0 flex-col gap-0.5 text-sm">
            <p className="font-semibold">{plural(total, "unsaved change")}</p>
            <p className="text-xs text-muted-foreground">{countsLine(draft)}</p>
            {firstStay === undefined ? null : (
              <p className="text-xs text-muted-foreground">
                {firstStay.role.name} stays, assigned via{" "}
                {firstStay.holder.name}.
              </p>
            )}
          </div>
          <div className="md:flex-1">
            <FormActionBar failure={failure}>
              <Button variant="secondary" disabled={saving} onClick={clear}>
                Discard
              </Button>
              <Button
                loading={saving}
                onClick={() => {
                  if (draft.remove.length > 0) setConfirmRemove(true);
                  else void save();
                }}
              >
                Save
              </Button>
            </FormActionBar>
          </div>
        </div>
      )}

      {props.recipient === null ? null : (
        <RemoveAccessDialog
          open={confirmRemove}
          recipient={{
            type: props.recipient.type,
            id: props.recipient.id,
            name,
          }}
          removals={confirmRemove ? removals() : []}
          onConfirm={() => void save()}
          onClose={() => setConfirmRemove(false)}
        />
      )}

      {props.recipient === null || view === null ? null : (
        <AdvancedAccessSheet
          // A new recipient starts a new sheet, so no draft crosses recipients.
          key={`${props.recipient.type}:${props.recipient.id}`}
          open={advancedOpen}
          recipientName={name}
          rows={view.notShown}
          catalogue={props.advanced.catalogue}
          guards={props.advanced.guards}
          grantRows={catalogue}
          recordLabels={props.recordLabels}
          initialAdd={advancedAdd}
          onSearchRecords={props.advanced.onSearchRecords}
          onSave={props.advanced.onSave}
          onClose={closeAdvanced}
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
