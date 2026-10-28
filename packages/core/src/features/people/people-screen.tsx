"use client";

import {
  Avatar,
  AvatarFallback,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  FilterDisclosure,
  focusRing,
  FormActionBar,
  HelpDisclosure,
  Input,
  LabelPill,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  StatusPill,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type DataTableAction,
} from "@genie/ui";
import { useEffect, useId, useMemo, useState } from "react";

import { useDialogSubmit } from "../admin/dialog-submit.ts";
import { PlusIcon, ShieldIcon, TrashIcon } from "../admin/icons.tsx";
import { NoMatch } from "../admin/no-match.tsx";
import { initials } from "../audit/helpers.ts";
import { GroupName } from "../groups/group-name.tsx";
import type {
  AccountType,
  AssignableRole,
  NewPersonInput,
  PeopleScreenProps,
  PeopleViewer,
  Person,
  PersonDetail,
  PersonStatus,
} from "./types.ts";

/** The stable refusal reason the server mirrors (R-38). */
export const LAST_ADMIN_REASON =
  "This would leave no active tenant administrator";

export const SELF_REASON = "You cannot disable or remove yourself";

function fmtDateTime(
  iso: string | null,
  timeZone: string,
  empty: string
): string {
  if (iso === null) return empty;

  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

const STATUS_TONE = {
  active: "success",
  pending: "neutral",
  disabled: "danger",
} as const satisfies Record<PersonStatus, string>;

const STATUS_LABEL: Record<PersonStatus, string> = {
  active: "Active",
  pending: "Pending",
  disabled: "Disabled",
};

const SORT_ITEMS = [
  { value: "name", label: "Name" },
  { value: "status", label: "Status" },
  { value: "lastSignIn", label: "Last sign-in" },
] as const;

type SortKey = (typeof SORT_ITEMS)[number]["value"];

const STATUS_FILTER_ITEMS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "disabled", label: "Disabled" },
] as const;

type StatusFilter = (typeof STATUS_FILTER_ITEMS)[number]["value"];

const TABS = ["profile", "groups", "roles", "sessions"] as const;

type ConfirmKind = "disable" | "remove";

function statusPill(status: PersonStatus) {
  return (
    <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>
  );
}

function groupPills(person: Person) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {person.groups.slice(0, 2).map((group) => (
        <LabelPill key={group.id}>
          <GroupName value={group.label} />
        </LabelPill>
      ))}
      {person.groups.length > 2 ? (
        <span className="text-xs text-muted-foreground">
          +{person.groups.length - 2}
        </span>
      ) : null}
    </span>
  );
}

function accountTypeLabel(accountType: AccountType): string {
  return accountType === "local" ? "Local password" : "Identity provider";
}

/** The Disable and Remove confirms, each always rendered and opened by `confirm`. */
function PersonConfirms(props: {
  readonly name: string;
  readonly confirm: ConfirmKind | null;
  readonly onConfirm: (kind: ConfirmKind) => void;
  readonly onClose: () => void;
}) {
  return (
    <>
      <ConfirmDialog
        open={props.confirm === "disable"}
        title={`Disable ${props.name}?`}
        description="They can no longer sign in but keep their history and their roles."
        confirmLabel="Disable"
        danger
        onConfirm={() => props.onConfirm("disable")}
        onClose={props.onClose}
      />
      <ConfirmDialog
        open={props.confirm === "remove"}
        title={`Remove ${props.name}?`}
        description="Every session ends, they are banned from signing in again, and their group memberships and direct roles go. Their name, email and audit trail stay."
        confirmLabel="Remove person"
        danger
        onConfirm={() => props.onConfirm("remove")}
        onClose={props.onClose}
      />
    </>
  );
}

/**
 * The person inspector: header, Profile, Groups, Roles and Sessions tabs (R-37). Disable and
 * Remove confirm inside the sheet, so that one Escape closes only the confirm (PD-8);
 * `onDisable` and `onRemove` fire once confirmed.
 */
export function PersonInspector(props: {
  readonly open?: boolean;
  readonly person: PersonDetail;
  readonly viewer: PeopleViewer;
  readonly self: boolean;
  readonly lastAdministrator: boolean;
  readonly onClose: () => void;
  readonly onDisable: () => void;
  readonly onEnable: () => void;
  readonly onRemove: () => void;
  readonly onResendSetPassword: () => void;
  readonly onResendInvitation: () => void;
  readonly onRevokeSession: (sessionId: string) => void;
  readonly onRevokeAllSessions: () => void;
  readonly onManageAccess?: (() => void) | undefined;
  readonly pending?: boolean | undefined;
}) {
  const { person, viewer } = props;
  const open = props.open ?? true;
  const [tab, setTab] = useState<(typeof TABS)[number]>("profile");
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);

  // The sheet stays mounted, so each open starts on the profile with no confirm.
  useEffect(() => {
    setTab("profile");
    setConfirm(null);
  }, [open, person.id]);

  const blocked = props.self || props.lastAdministrator;

  const blockedReason = props.self ? SELF_REASON : LAST_ADMIN_REASON;

  const pendingLocal =
    person.status === "pending" && person.accountType === "local";

  const pendingBrokered =
    person.status === "pending" && person.accountType === "brokered";

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) props.onClose();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{person.name}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {statusPill(person.status)}
            <span className="text-xs text-muted-foreground wrap-anywhere">
              {person.email}
            </span>
          </div>

          <Tabs
            value={tab}
            onValueChange={(value) =>
              setTab(TABS.find((key) => key === value) ?? "profile")
            }
          >
            <TabsList aria-label="Person detail">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="groups">
                Groups ({person.groups.length})
              </TabsTrigger>
              <TabsTrigger value="roles">
                Roles ({person.assignments.length})
              </TabsTrigger>
              <TabsTrigger value="sessions">
                Sessions ({person.sessions.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <dl className="divide-y divide-input text-sm">
                <ProfileRow label="Name" value={person.name} />
                <ProfileRow label="Email" value={person.email} />
                <ProfileRow
                  label="Account type"
                  value={accountTypeLabel(person.accountType)}
                />
                <ProfileRow
                  label="Identity source"
                  value={person.identitySource}
                />
                <ProfileRow
                  label="First sign-in"
                  value={fmtDateTime(
                    person.firstSignInAt,
                    viewer.timeZone,
                    "Never"
                  )}
                />
                <ProfileRow
                  label="Last sign-in"
                  value={fmtDateTime(
                    person.lastSignInAt,
                    viewer.timeZone,
                    "Never"
                  )}
                />
                <ProfileRow
                  label="Onboarding"
                  value={person.onboarding === "jit" ? "JIT" : "Invited"}
                />
              </dl>

              {pendingLocal ? (
                <div className="mt-3 rounded-lg border border-input p-3">
                  <p className="text-sm text-foreground">
                    A separate email sets this person&apos;s password.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last sent{" "}
                    {fmtDateTime(
                      person.setPasswordSentAt,
                      viewer.timeZone,
                      "never"
                    )}
                  </p>
                  <div className="mt-2">
                    <Button
                      variant="secondary"
                      loading={props.pending}
                      onClick={props.onResendSetPassword}
                    >
                      Resend set-password email
                    </Button>
                  </div>
                </div>
              ) : null}

              {pendingBrokered ? (
                <div className="mt-3 rounded-lg border border-input p-3">
                  <p className="text-xs text-muted-foreground">
                    Last sent{" "}
                    {fmtDateTime(
                      person.invitationSentAt,
                      viewer.timeZone,
                      "never"
                    )}
                  </p>
                  <div className="mt-2">
                    <Button
                      variant="secondary"
                      loading={props.pending}
                      onClick={props.onResendInvitation}
                    >
                      Resend invitation
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2 border-t border-input pt-3">
                {person.status === "disabled" ? (
                  <Button
                    variant="secondary"
                    loading={props.pending}
                    onClick={props.onEnable}
                  >
                    Re-enable
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={blocked}
                    title={blocked ? blockedReason : undefined}
                    loading={props.pending}
                    onClick={() => setConfirm("disable")}
                  >
                    Disable
                  </Button>
                )}
                <Button
                  variant="danger"
                  disabled={blocked}
                  title={blocked ? blockedReason : undefined}
                  loading={props.pending}
                  onClick={() => setConfirm("remove")}
                >
                  <TrashIcon /> Remove
                </Button>
              </div>

              {blocked ? (
                <p className="mt-2 text-sm text-foreground">{blockedReason}</p>
              ) : null}
            </TabsContent>

            <TabsContent value="groups">
              <ul className="divide-y divide-input">
                {person.groups.map((group) => (
                  <li key={group.id} className="py-2 text-sm text-foreground">
                    <span className="font-medium">
                      <GroupName value={group.label} />
                    </span>{" "}
                    <span className="text-xs text-muted-foreground">
                      {group.source === "idp" ? "Directory" : "Local"}
                      {group.syncedAt === null
                        ? ""
                        : ` · synced ${fmtDateTime(group.syncedAt, viewer.timeZone, "")}`}
                    </span>
                  </li>
                ))}
                {person.groups.length === 0 ? (
                  <li className="py-2 text-sm text-muted-foreground">
                    This person is in no group.
                  </li>
                ) : null}
              </ul>
            </TabsContent>

            <TabsContent value="roles">
              <ul className="divide-y divide-input">
                {person.assignments.map((assignment) => (
                  <li
                    key={assignment.id}
                    className="py-2 text-sm text-foreground"
                  >
                    <span className="font-medium">{assignment.roleName}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      ·{" "}
                      {assignment.source === "direct" ? (
                        "Direct"
                      ) : (
                        <>
                          via{" "}
                          <GroupName
                            value={assignment.groupName ?? "a group"}
                          />
                        </>
                      )}
                      {assignment.scopeType === null
                        ? ""
                        : ` · ${assignment.scopeType} ${assignment.scopeId}`}
                    </span>
                  </li>
                ))}
                {person.assignments.length === 0 ? (
                  <li className="py-2 text-sm text-muted-foreground">
                    This person holds no role yet.
                  </li>
                ) : null}
              </ul>
              {props.onManageAccess === undefined ? null : (
                <div className="mt-3">
                  <Button variant="secondary" onClick={props.onManageAccess}>
                    <ShieldIcon /> Manage in Access
                  </Button>
                </div>
              )}
              <HelpDisclosure label="How this adds up">
                A role held directly is this person&apos;s. A role held through
                a group changes for every member of that group.
              </HelpDisclosure>
            </TabsContent>

            <TabsContent value="sessions">
              <ul className="divide-y divide-input">
                {person.sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center justify-between gap-2 py-2 text-sm text-foreground"
                  >
                    <span className="min-w-0 wrap-anywhere">
                      {session.device} · {session.browser}
                      <span className="block text-xs text-muted-foreground">
                        {session.ipAddress} · last active{" "}
                        {fmtDateTime(session.lastActiveAt, viewer.timeZone, "")}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={props.pending}
                      onClick={() => props.onRevokeSession(session.id)}
                    >
                      Sign out
                    </Button>
                  </li>
                ))}
                {person.sessions.length === 0 ? (
                  <li className="py-2 text-sm text-muted-foreground">
                    This person has no open session.
                  </li>
                ) : null}
              </ul>
              {person.sessions.length === 0 ? null : (
                <div className="mt-3">
                  <Button
                    variant="ghost"
                    loading={props.pending}
                    onClick={props.onRevokeAllSessions}
                  >
                    Sign out all
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Inside the sheet's content, so that one Escape closes only the confirm (PD-8). */}
        <PersonConfirms
          name={person.name}
          confirm={confirm}
          onConfirm={(kind) => {
            setConfirm(null);

            if (kind === "disable") props.onDisable();
            else props.onRemove();
          }}
          onClose={() => setConfirm(null)}
        />
      </SheetContent>
    </Sheet>
  );
}

function ProfileRow(props: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0 text-right text-foreground wrap-anywhere">
        {props.value}
      </dd>
    </div>
  );
}

/**
 * The People directory (R-37 to R-43). It reads and writes only through callbacks, which the host
 * maps onto the People router; every destructive action confirms first, and an action that would
 * leave no administrator or target the viewer is disabled with the server's own reason (R-38).
 */
export function PeopleScreen(props: PeopleScreenProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(props.initialSelectedId ?? null);

  // The inspector stays mounted while it closes, so its exit and its focus return run.
  const [inspectorOpen, setInspectorOpen] = useState(
    props.initialSelectedId !== undefined
  );

  const [adding, setAdding] = useState(false);
  // The Add person dialog waits for the host and keeps a refusal inside it (U-1, R-38).
  const addForm = useDialogSubmit();
  const searchId = useId();
  const statusId = useId();
  const groupId = useId();

  // The row menu's confirm. Closing clears only the kind, so the title holds during the exit.
  const [confirm, setConfirm] = useState<{
    readonly kind: ConfirmKind | null;
    readonly person: Person;
  } | null>(null);

  const groupOptions = useMemo(() => {
    const seen = new Map<string, string>();

    for (const person of props.people) {
      for (const group of person.groups) seen.set(group.id, group.label);
    }

    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [props.people]);

  const groupItems = [
    { value: "all", label: "All" },
    ...groupOptions.map((group) => ({ value: group.id, label: group.label })),
  ];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const rows = props.people.filter((person) => {
      if (
        needle !== "" &&
        !`${person.name} ${person.email}`.toLowerCase().includes(needle)
      ) {
        return false;
      }

      if (statusFilter !== "all" && person.status !== statusFilter)
        return false;

      if (
        groupFilter !== "all" &&
        !person.groups.some((group) => group.id === groupFilter)
      ) {
        return false;
      }

      return true;
    });

    const sorted = [...rows];

    if (sort === "name") {
      sorted.sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
      );
    } else if (sort === "status") {
      sorted.sort((left, right) => left.status.localeCompare(right.status));
    } else {
      sorted.sort((left, right) =>
        (right.lastSignInAt ?? "").localeCompare(left.lastSignInAt ?? "")
      );
    }

    return sorted;
  }, [props.people, query, sort, statusFilter, groupFilter]);

  const activeFilterCount =
    (statusFilter === "all" ? 0 : 1) + (groupFilter === "all" ? 0 : 1);

  const clearFilters = () => {
    setStatusFilter("all");
    setGroupFilter("all");
  };

  const rowActions = (person: Person): readonly DataTableAction[] => {
    const refusal =
      person.id === props.viewer.id
        ? SELF_REASON
        : props.lastAdministratorPersonIds.includes(person.id)
          ? LAST_ADMIN_REASON
          : undefined;

    const refused = refusal === undefined ? {} : { refusal };

    return [
      person.status === "disabled"
        ? {
            label: "Re-enable",
            onSelect: () => props.onEnablePerson?.(person.id),
          }
        : {
            label: "Disable",
            onSelect: () => setConfirm({ kind: "disable", person }),
            ...refused,
          },
      {
        label: "Remove",
        danger: true,
        onSelect: () => setConfirm({ kind: "remove", person }),
        ...refused,
      },
    ];
  };

  const lastSignIn = (person: Person) =>
    fmtDateTime(person.lastSignInAt, props.viewer.timeZone, "—");

  const selected = props.details?.[selectedId ?? ""];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <label htmlFor={searchId} className="sr-only">
            {props.searchLabel}
          </label>
          <Input
            id={searchId}
            className="sm:w-72 sm:flex-none"
            placeholder={props.searchLabel}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <HelpDisclosure label="Pending, disabled, removed">
            Pending ends at first sign-in. Disable keeps history; Remove ends
            sessions and bans. Replacing a name with an anonymous one is an
            operator command.
          </HelpDisclosure>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground">Sort</span>
            <Select
              items={SORT_ITEMS}
              value={sort}
              onValueChange={(value) =>
                setSort(
                  SORT_ITEMS.find((item) => item.value === value)?.value ??
                    "name"
                )
              }
            >
              <SelectTrigger aria-label="Sort people" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FilterDisclosure count={activeFilterCount} onClear={clearFilters}>
            <Field>
              <FieldLabel htmlFor={statusId}>Status</FieldLabel>
              <Select
                items={STATUS_FILTER_ITEMS}
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(
                    STATUS_FILTER_ITEMS.find((item) => item.value === value)
                      ?.value ?? "all"
                  )
                }
              >
                <SelectTrigger id={statusId} aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={groupId}>Group</FieldLabel>
              <Select
                items={groupItems}
                value={groupFilter}
                onValueChange={(value) => setGroupFilter(value ?? "all")}
              >
                <SelectTrigger id={groupId} aria-label="Filter by group">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groupItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FilterDisclosure>
          <Button onClick={() => setAdding(true)}>
            <PlusIcon /> Add person
          </Button>
        </div>
      </div>

      {activeFilterCount === 0 ? null : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {statusFilter === "all" ? null : (
            <FilterChip
              label={`Status: ${STATUS_LABEL[statusFilter]}`}
              onRemove={() => setStatusFilter("all")}
            />
          )}
          {groupFilter === "all" ? null : (
            <FilterChip
              label={`Group: ${
                groupOptions.find((group) => group.id === groupFilter)?.label ??
                groupFilter
              }`}
              onRemove={() => setGroupFilter("all")}
            />
          )}
          <Button variant="link" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        </div>
      )}

      {/* While Add person is open, its dialog shows the error, so the page does not repeat it. */}
      {props.error === undefined || adding ? null : (
        <p
          role="alert"
          className="mt-3 text-sm text-destructive dark:text-destructive-on-dark"
        >
          {props.error}
        </p>
      )}

      {props.notice === undefined ? null : (
        <p role="status" className="mt-3 text-sm text-foreground">
          {props.notice}
        </p>
      )}

      {props.loading ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading people…
        </p>
      ) : filtered.length === 0 ? (
        <NoMatch
          copy={props.noMatch}
          onClear={() => {
            setQuery("");
            clearFilters();
          }}
        />
      ) : (
        <div className="mt-4">
          <DataTable
            label="People"
            rows={filtered}
            rowKey={(person) => person.id}
            rowLabel={(person) => person.email}
            onOpenRow={(person) => {
              setSelectedId(person.id);
              setInspectorOpen(true);
              props.onSelectPerson?.(person.id);
            }}
            columns={[
              {
                id: "person",
                header: "Person",
                cell: (person) => (
                  <span className="flex items-center gap-3">
                    <Avatar aria-hidden="true">
                      <AvatarFallback>{initials(person.name)}</AvatarFallback>
                    </Avatar>
                    <span className="flex min-w-0 flex-col items-start">
                      <span>{person.name}</span>
                      <span className="text-xs font-normal text-muted-foreground wrap-anywhere">
                        {person.email}
                      </span>
                    </span>
                  </span>
                ),
              },
              { id: "groups", header: "Groups", cell: groupPills },
              {
                id: "roles",
                header: "Roles",
                cell: (person) => person.roleCount,
                align: "end",
              },
              { id: "lastSignIn", header: "Last sign-in", cell: lastSignIn },
            ]}
            status={(person) => statusPill(person.status)}
            facts={(person) => [
              groupPills(person),
              `${person.roleCount} role${
                person.roleCount === 1 ? "" : "s"
              } · last sign-in ${lastSignIn(person)}`,
            ]}
            actions={rowActions}
          />
        </div>
      )}

      <AddPersonDialog
        open={adding}
        settings={props.settings}
        roles={props.roles}
        canAssignRoles={props.canAssignRoles}
        error={addForm.failure ?? undefined}
        submitting={addForm.submitting}
        onCancel={() => {
          addForm.clear();
          setAdding(false);
        }}
        onSubmit={(input) => {
          void addForm.submit(
            () => props.onAddPerson?.(input),
            () => setAdding(false)
          );
        }}
      />

      {selected === undefined ? null : (
        <PersonInspector
          open={inspectorOpen}
          pending={props.pending}
          person={selected}
          viewer={props.viewer}
          self={selected.id === props.viewer.id}
          lastAdministrator={props.lastAdministratorPersonIds.includes(
            selected.id
          )}
          onClose={() => {
            setInspectorOpen(false);
            props.onSelectPerson?.(null);
          }}
          onDisable={() => props.onDisablePerson?.(selected.id)}
          onEnable={() => props.onEnablePerson?.(selected.id)}
          onRemove={() => props.onRemovePerson?.(selected.id)}
          onResendSetPassword={() => props.onResendSetPassword?.(selected.id)}
          onResendInvitation={() => props.onResendInvitation?.(selected.id)}
          onRevokeSession={(sessionId) =>
            props.onRevokeSession?.(selected.id, sessionId)
          }
          onRevokeAllSessions={() => props.onRevokeAllSessions?.(selected.id)}
          onManageAccess={
            props.onManageAccess === undefined
              ? undefined
              : () => props.onManageAccess?.(selected.id)
          }
        />
      )}

      <PersonConfirms
        name={confirm?.person.name ?? ""}
        confirm={confirm?.kind ?? null}
        onConfirm={(kind) => {
          if (confirm === null) return;

          setConfirm({ ...confirm, kind: null });

          if (kind === "disable") props.onDisablePerson?.(confirm.person.id);
          else props.onRemovePerson?.(confirm.person.id);
        }}
        onClose={() =>
          setConfirm((current) =>
            current === null ? null : { ...current, kind: null }
          )
        }
      />
    </div>
  );
}

function FilterChip(props: {
  readonly label: string;
  readonly onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
      {props.label}
      <button
        type="button"
        className={`inline-flex min-h-11 items-center rounded-full px-2 font-medium underline lg:min-h-0 ${focusRing}`}
        aria-label={`Remove filter ${props.label}`}
        onClick={props.onRemove}
      >
        Remove
      </button>
    </span>
  );
}

/** The Add person dialog (R-40, R-40a, design: email, display name, roles, notes). */
export function AddPersonDialog(props: {
  readonly open?: boolean;
  readonly settings: PeopleScreenProps["settings"];
  readonly roles: readonly AssignableRole[];
  /** False hides the role picker for a holder of `core:people:manage` alone (DEC-39). */
  readonly canAssignRoles?: boolean | undefined;
  /** The catalogue message of a refusal, shown in the alert; the dialog stays open. */
  readonly error?: string | undefined;
  readonly submitting?: boolean | undefined;
  readonly onCancel: () => void;
  readonly onSubmit: (input: NewPersonInput) => void;
}) {
  const open = props.open ?? true;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [accountType, setAccountType] = useState<AccountType>("brokered");
  const [sendInvitation, setSendInvitation] = useState(true);
  const emailId = useId();
  const nameId = useId();
  const rolesId = useId();
  const accountTypeId = useId();

  // The dialog stays mounted, so each open starts from an empty form.
  useEffect(() => {
    if (!open) return;

    setEmail("");
    setName("");
    setRoleIds([]);
    setAccountType("brokered");
    setSendInvitation(true);
  }, [open]);

  const localAvailable = props.settings.localAccountsEnabled;

  const canAssignRoles = props.canAssignRoles ?? true;

  const brokered = !localAvailable || accountType === "brokered";

  const roleItems = props.roles.map((role) => ({
    value: role.id,
    label: role.name,
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) props.onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor={emailId}>Email</FieldLabel>
            <Input
              id={emailId}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={nameId}>Display name</FieldLabel>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          {canAssignRoles ? (
            <Field>
              <FieldLabel htmlFor={rolesId}>Roles</FieldLabel>
              <Select
                multiple
                items={roleItems}
                value={roleIds}
                onValueChange={setRoleIds}
              >
                <SelectTrigger id={rolesId}>
                  <SelectValue placeholder="Choose roles" />
                </SelectTrigger>
                <SelectContent>
                  {roleItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {localAvailable ? (
            <div>
              <span
                id={accountTypeId}
                className="mb-1 block text-xs font-semibold text-foreground"
              >
                Account type
              </span>
              <RadioGroup
                aria-labelledby={accountTypeId}
                value={accountType}
                onValueChange={(value) => {
                  if (value === "brokered" || value === "local")
                    setAccountType(value);
                }}
              >
                <label className="inline-flex min-h-11 items-center gap-2 text-sm lg:min-h-0">
                  <RadioGroupItem value="brokered" />
                  Identity provider
                </label>
                <label className="inline-flex min-h-11 items-center gap-2 text-sm lg:min-h-0">
                  <RadioGroupItem value="local" />
                  Local password
                </label>
              </RadioGroup>
            </div>
          ) : null}

          {localAvailable && accountType === "local" ? (
            <p className="text-sm text-muted-foreground">
              A separate email sets this person&apos;s password.
            </p>
          ) : null}

          {brokered ? (
            <label className="flex min-h-11 items-center gap-2 text-sm text-foreground lg:min-h-0">
              <Checkbox
                checked={sendInvitation}
                onCheckedChange={setSendInvitation}
              />
              Send invitation email
            </label>
          ) : null}

          <p className="text-sm text-muted-foreground">
            {props.settings.onboardingMode === "jit"
              ? "People in a group mapped to a role can also sign in without being added here."
              : "Pending until first sign-in."}
          </p>
        </div>
        {/* A refused add reports in the action bar, beside the buttons, and keeps the form. */}
        <FormActionBar failure={props.error ?? null} placement="dialog">
          <Button variant="secondary" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button
            disabled={email.trim() === ""}
            loading={props.submitting === true}
            onClick={() =>
              props.onSubmit({
                email: email.trim(),
                name: name.trim() === "" ? undefined : name.trim(),
                roleIds: canAssignRoles ? roleIds : [],
                accountType: localAvailable ? accountType : undefined,
                sendInvitation: brokered ? sendInvitation : undefined,
              })
            }
          >
            Add person
          </Button>
        </FormActionBar>
      </DialogContent>
    </Dialog>
  );
}
