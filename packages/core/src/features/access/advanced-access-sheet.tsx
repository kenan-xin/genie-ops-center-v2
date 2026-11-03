"use client";

import {
  Button,
  Field,
  FieldLabel,
  FormActionBar,
  LabelPill,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StatusPill,
  ToggleGroup,
  ToggleGroupItem,
  WarningNote,
} from "@genie/ui";
import { XIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import type { Scope } from "../../lib/module-contract/keys.ts";
import type {
  AdvancedCatalogue,
  AdvancedChanges,
  AdvancedOption,
  RemovalGuard,
} from "../../services/roles/advanced.ts";
import type { AccessPath } from "../../services/roles/effective-access.ts";
import type { GrantRow } from "../../services/roles/grants.ts";
import type { ScopeRecord } from "../../services/roles/records.ts";
import {
  type AdvancedAdd,
  type AdvancedDraft,
  advancedSaveInput,
  EMPTY_ADVANCED_DRAFT,
  scopeKey,
} from "./advanced-view.ts";
import { moduleNameOf, REFUSAL } from "./grants-view.ts";
import { RecordPicker } from "./record-picker.tsx";

export type AdvancedAccessSheetProps = {
  readonly open: boolean;
  readonly recipientName: string;
  /** The recipient's direct roles that Grants does not show (AD9). */
  readonly rows: readonly AccessPath[];
  readonly catalogue: AdvancedCatalogue | undefined;
  readonly guards: readonly RemovalGuard[] | undefined;
  readonly grantRows: readonly GrantRow[];
  /** Record labels by `scopeKey`, only for records the caller can open (AD10). */
  readonly recordLabels: ReadonlyMap<string, string>;
  /** A role that a `?role=` link stages when the sheet opens (AD12). */
  readonly initialAdd?: AdvancedAdd | undefined;
  readonly onSearchRecords: (
    recordType: string,
    query: string
  ) => Promise<readonly ScopeRecord[]>;
  /** Rejects with `{ message }` when the server refuses. The sheet keeps the draft. */
  readonly onSave: (changes: AdvancedChanges) => Promise<void>;
  readonly onClose: () => void;
};

const GUARD_REASON = {
  "self-protection": "You cannot remove your own Tenant administrator role",
  "last-administrator":
    "Last active Tenant administrator path. Give the role to somebody else first.",
} as const;

const GROUPS = [
  ["core", "Core"],
  ["record", "Module role at one record"],
  ["custom", "Custom roles"],
] as const;

const optionLabel = (option: AdvancedOption, group: string) =>
  `${
    group === "record"
      ? `${option.moduleName}: ${option.roleName}`
      : `${option.roleName} (${option.moduleName})`
  }${option.enabled ? "" : ", module off"}`;

const scopeText = (scope: Scope | null, label: string | null | undefined) =>
  scope === null ? "Whole tenant" : `One record · ${label ?? scope.id}`;

const sameScope = (left: Scope | null, right: Scope | null) =>
  left === null || right === null
    ? left === right
    : scopeKey(left) === scopeKey(right);

/** "Analytics", "Analytics and Slides", "Analytics, Slides and Ask". */
const listOf = (names: readonly string[]) =>
  names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

const draftOf = (initialAdd: AdvancedAdd | undefined): AdvancedDraft =>
  initialAdd === undefined
    ? EMPTY_ADVANCED_DRAFT
    : { add: [initialAdd], remove: [] };

const CAPTION =
  "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

/** One role of the list: its name, its module and scope pills, and its action. */
function RoleRow(props: {
  readonly name: string;
  readonly module: string;
  readonly scope: string;
  readonly custom: boolean;
  readonly inactive?: boolean;
  readonly state?: "pending" | "pending-removal";
  readonly reason?: string | undefined;
  /** Gets the id of the reason line, so a disabled button can point at it. */
  readonly action: (reasonId: string | undefined) => ReactNode;
}) {
  const reasonId = useId();

  return (
    <li className="flex items-start gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold wrap-anywhere">{props.name}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground">{props.module}</span>
          <LabelPill>{props.scope}</LabelPill>
          {props.custom ? <LabelPill>Custom role</LabelPill> : null}
          {props.inactive === true ? (
            <StatusPill tone="warning">Inactive</StatusPill>
          ) : null}
          {props.state === "pending" ? (
            <StatusPill tone="neutral">Pending</StatusPill>
          ) : null}
          {props.state === "pending-removal" ? (
            <StatusPill tone="neutral">Pending removal</StatusPill>
          ) : null}
        </div>
        {props.reason === undefined ? null : (
          <p id={reasonId} className="text-xs text-muted-foreground">
            {props.reason}
          </p>
        )}
      </div>
      <div className="shrink-0">
        {props.action(props.reason === undefined ? undefined : reasonId)}
      </div>
    </li>
  );
}

/**
 * Advanced access (R-37c): core administration, the Auditor role, a module role at one record,
 * and custom roles for one recipient. Every change is staged, and one Save writes them all through
 * the role-assignment service. A guarded Tenant administrator row keeps Remove disabled with its
 * reason (R-38). The draft lives here and is dropped on close (AD11).
 */
export function AdvancedAccessSheet(
  props: AdvancedAccessSheetProps
): ReactNode {
  const roleLabelId = useId();

  const scopeLabelId = useId();

  const [draft, setDraft] = useState(() => draftOf(props.initialAdd));

  const [pick, setPick] = useState<string | null>(null);

  const [oneRecord, setOneRecord] = useState(false);

  const [record, setRecord] = useState<ScopeRecord | null>(null);

  const [saving, setSaving] = useState(false);

  const [failure, setFailure] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(props.open);

  // Each opening starts a new draft, with the add of a link when one is given.
  if (props.open !== wasOpen) {
    setWasOpen(props.open);

    if (props.open) {
      setDraft(draftOf(props.initialAdd));
      setPick(null);
      setRecord(null);
      setOneRecord(false);
      setFailure(null);
    }
  }

  const catalogue = props.catalogue ?? { core: [], record: [], custom: [] };

  const options = [...catalogue.core, ...catalogue.record, ...catalogue.custom];

  const picked = options.find((option) => option.roleId === pick) ?? null;

  const needsRecord =
    picked !== null &&
    picked.recordType !== null &&
    (!picked.wholeTenant || oneRecord);

  const ready =
    picked !== null && picked.enabled && (!needsRecord || record !== null);

  const off = [
    ...new Set(
      options.flatMap((option) => (option.enabled ? [] : [option.moduleName]))
    ),
  ];

  const total = draft.add.length + draft.remove.length;

  const add = () => {
    if (picked === null || !ready) return;

    const scope =
      needsRecord && record !== null && picked.recordType !== null
        ? { type: picked.recordType, id: record.id }
        : null;

    const listed =
      props.rows.some(
        (path) => path.role.id === picked.roleId && sameScope(path.scope, scope)
      ) ||
      draft.add.some(
        (entry) =>
          entry.option.roleId === picked.roleId && sameScope(entry.scope, scope)
      );

    if (!listed) {
      setDraft({
        ...draft,
        add: [
          ...draft.add,
          {
            option: picked,
            scope,
            label: needsRecord ? (record?.label ?? null) : null,
          },
        ],
      });
    }

    setPick(null);
    setRecord(null);
    setOneRecord(false);
  };

  const save = async () => {
    setFailure(null);
    setSaving(true);

    try {
      await props.onSave(advancedSaveInput(draft));
      props.onClose();
    } catch (error) {
      const refusal = REFUSAL.safeParse(error);

      setFailure(
        refusal.success
          ? refusal.data.message
          : "The advanced access changes were not saved."
      );
    } finally {
      setSaving(false);
    }
  };

  const items = GROUPS.flatMap(([group]) =>
    catalogue[group].map((option) => ({
      value: option.roleId,
      label: optionLabel(option, group),
    }))
  );

  return (
    <Sheet
      open={props.open}
      onOpenChange={(next) => {
        // A save in flight keeps the sheet open: its late answer would close the next one.
        if (!next && !saving) props.onClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="data-[side=right]:md:w-140"
      >
        <SheetHeader>
          <SheetTitle>Advanced access</SheetTitle>
          <SheetDescription>
            Core administration, the Auditor role, a module role at one record,
            and custom roles for{" "}
            <b className="font-semibold text-foreground">
              {props.recipientName}
            </b>
            . One Save writes every change through the same role-assignment
            service.
          </SheetDescription>
          <SheetClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-3 right-3"
                aria-label="Close Advanced access"
                disabled={saving}
              />
            }
          >
            <XIcon aria-hidden="true" />
          </SheetClose>
        </SheetHeader>

        <div
          inert={saving}
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4"
        >
          {off.length === 0 ? null : (
            <WarningNote size="sm" role="status">
              {listOf(off)} {off.length === 1 ? "is" : "are"} switched off, so{" "}
              {off.length === 1 ? "its" : "their"} roles take no new grant here.
              Removal still works.
            </WarningNote>
          )}

          <section className="flex flex-col gap-1">
            <h3 className={CAPTION}>Advanced roles of {props.recipientName}</h3>
            {props.rows.length + draft.add.length === 0 ? (
              <p className="py-2 text-muted-foreground">
                {props.recipientName} holds no advanced role.
              </p>
            ) : (
              <ul>
                {props.rows.map((path) => {
                  const gone = draft.remove.includes(path.assignmentId);

                  const guard = gone
                    ? undefined
                    : props.guards?.find(
                        (entry) => entry.assignmentId === path.assignmentId
                      );

                  const reason =
                    guard === undefined
                      ? undefined
                      : GUARD_REASON[guard.reason];

                  return (
                    <RoleRow
                      key={path.assignmentId}
                      name={path.role.name}
                      module={moduleNameOf(path, props.grantRows)}
                      scope={scopeText(
                        path.scope,
                        path.scope === null
                          ? null
                          : props.recordLabels.get(scopeKey(path.scope))
                      )}
                      custom={path.role.kind === "custom"}
                      inactive={path.notInEffect.includes("module-off")}
                      {...(gone ? { state: "pending-removal" as const } : {})}
                      reason={reason}
                      action={(reasonId) =>
                        gone ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                remove: draft.remove.filter(
                                  (id) => id !== path.assignmentId
                                ),
                              })
                            }
                          >
                            Undo
                          </Button>
                        ) : (
                          <Button
                            variant="danger-outline"
                            size="sm"
                            aria-label={`Remove ${path.role.name}`}
                            disabled={reason !== undefined}
                            aria-describedby={reasonId}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                remove: [...draft.remove, path.assignmentId],
                              })
                            }
                          >
                            Remove
                          </Button>
                        )
                      }
                    />
                  );
                })}
                {draft.add.map((entry, index) => (
                  <RoleRow
                    key={`${entry.option.roleId}:${entry.scope === null ? "" : scopeKey(entry.scope)}`}
                    name={entry.option.roleName}
                    module={entry.option.moduleName}
                    scope={scopeText(entry.scope, entry.label)}
                    custom={entry.option.kind === "custom"}
                    state="pending"
                    action={() => (
                      <Button
                        variant="danger-outline"
                        size="sm"
                        aria-label={`Remove ${entry.option.roleName}, not saved yet`}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            add: draft.add.filter((_, at) => at !== index),
                          })
                        }
                      >
                        Remove
                      </Button>
                    )}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className={CAPTION}>Add a role</h3>
            <Field>
              <FieldLabel id={roleLabelId}>Role</FieldLabel>
              <Select
                items={items}
                value={pick}
                onValueChange={(roleId: string | null) => {
                  setPick(roleId);
                  setRecord(null);
                  setOneRecord(false);
                }}
              >
                <SelectTrigger aria-labelledby={roleLabelId}>
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {GROUPS.map(([group, caption]) =>
                    catalogue[group].length === 0 ? null : (
                      <SelectGroup key={group}>
                        <SelectLabel>{caption}</SelectLabel>
                        {catalogue[group].map((option) => (
                          <SelectItem
                            key={option.roleId}
                            value={option.roleId}
                            disabled={!option.enabled}
                          >
                            {optionLabel(option, group)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )
                  )}
                </SelectContent>
              </Select>
            </Field>

            {picked === null || picked.recordType === null ? null : (
              <Field>
                <FieldLabel id={scopeLabelId}>Scope</FieldLabel>
                {picked.wholeTenant ? (
                  <ToggleGroup<"tenant" | "record">
                    aria-labelledby={scopeLabelId}
                    value={[oneRecord ? "record" : "tenant"]}
                    onValueChange={(values) => {
                      const [next] = values;

                      if (next !== undefined) setOneRecord(next === "record");
                    }}
                  >
                    <ToggleGroupItem value="tenant">
                      Whole tenant
                    </ToggleGroupItem>
                    <ToggleGroupItem value="record">One record</ToggleGroupItem>
                  </ToggleGroup>
                ) : null}
                {needsRecord && picked.recordType !== null ? (
                  <RecordPicker
                    key={picked.roleId}
                    recordType={picked.recordType}
                    value={record}
                    onSearch={props.onSearchRecords}
                    onPick={setRecord}
                  />
                ) : null}
                {picked.kind === "system" ? (
                  <p className="text-xs text-muted-foreground">
                    A module role here reaches one record. The whole module is a
                    row on Grants.
                  </p>
                ) : null}
                {needsRecord ? (
                  <p className="text-xs text-muted-foreground">
                    Only records you can open are listed.
                  </p>
                ) : null}
              </Field>
            )}

            <Button
              variant="secondary"
              className="self-start"
              disabled={!ready}
              onClick={add}
            >
              Add to the list
            </Button>
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t border-border p-4 md:flex-row md:items-center md:justify-between">
          <p aria-live="polite" className="shrink-0 text-muted-foreground">
            {total === 0
              ? "Nothing to save yet."
              : `${total} unsaved ${total === 1 ? "change" : "changes"}`}
          </p>
          <FormActionBar failure={failure}>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={props.onClose}
            >
              Cancel
            </Button>
            <Button
              loading={saving}
              disabled={total === 0}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </FormActionBar>
        </div>
      </SheetContent>
    </Sheet>
  );
}
