"use client";

import { useMemo, useState } from "react";

import {
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
} from "../admin/icons.tsx";
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  btnSecondary,
  ConfirmDialog,
  Field,
  HelpDisclosure,
  inputClass,
  Pill,
  SlideOver,
  type PillTone,
} from "../admin/ui.tsx";
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

const STATUS_TONE: Record<PersonStatus, PillTone> = {
  active: "success",
  pending: "neutral",
  disabled: "danger",
};

const STATUS_LABEL: Record<PersonStatus, string> = {
  active: "Active",
  pending: "Pending",
  disabled: "Disabled",
};

function statusPill(status: PersonStatus) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== "")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function accountTypeLabel(accountType: AccountType): string {
  return accountType === "local" ? "Local password" : "Identity provider";
}

/**
 * The row overflow menu: Disable or Re-enable, then Remove. Each is disabled with the server's
 * own reason when the action is self-targeting or would leave no active administrator (R-38).
 */
function RowMenu(props: {
  readonly person: Person;
  readonly self: boolean;
  readonly lastAdministrator: boolean;
  readonly blockedReason: string | undefined;
  readonly onDisable: () => void;
  readonly onEnable: () => void;
  readonly onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className={btnGhost}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${props.person.email}`}
        onClick={() => setOpen((value) => !value)}
      >
        Actions
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={`Actions for ${props.person.email}`}
          className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-input bg-white p-1 shadow-lg dark:bg-card"
        >
          {props.person.status === "disabled" ? (
            <button
              type="button"
              role="menuitem"
              className={`${btnGhost} w-full justify-start`}
              onClick={() => {
                setOpen(false);
                props.onEnable();
              }}
            >
              Re-enable
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className={`${btnGhost} w-full justify-start`}
              disabled={props.self || props.lastAdministrator}
              title={props.blockedReason}
              onClick={() => {
                setOpen(false);
                props.onDisable();
              }}
            >
              Disable
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={`${btnGhost} w-full justify-start text-destructive`}
            disabled={props.self || props.lastAdministrator}
            title={props.blockedReason}
            onClick={() => {
              setOpen(false);
              props.onRemove();
            }}
          >
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The person inspector: header, Profile, Groups, Roles and Sessions tabs (R-37). */
export function PersonInspector(props: {
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
}) {
  const { person, viewer } = props;

  const [tab, setTab] = useState<"profile" | "groups" | "roles" | "sessions">(
    "profile"
  );

  const blocked = props.self || props.lastAdministrator;

  const blockedReason = props.self ? SELF_REASON : LAST_ADMIN_REASON;

  const pendingLocal =
    person.status === "pending" && person.accountType === "local";

  const pendingBrokered =
    person.status === "pending" && person.accountType === "brokered";

  return (
    <SlideOver title={person.name} onClose={props.onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {person.name}
        </span>
        {statusPill(person.status)}
        <span className="text-xs text-muted-foreground">{person.email}</span>
      </div>

      <div className="mt-3" role="tablist" aria-label="Person detail">
        {(
          [
            ["profile", "Profile"],
            ["groups", `Groups (${person.groups.length})`],
            ["roles", `Roles (${person.assignments.length})`],
            ["sessions", `Sessions (${person.sessions.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={btnGhost}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "profile" ? (
        <div className="mt-2">
          <dl className="divide-y divide-input text-sm">
            <ProfileRow label="Name" value={person.name} />
            <ProfileRow label="Email" value={person.email} />
            <ProfileRow
              label="Account type"
              value={accountTypeLabel(person.accountType)}
            />
            <ProfileRow label="Identity source" value={person.identitySource} />
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
              value={fmtDateTime(person.lastSignInAt, viewer.timeZone, "Never")}
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
              <button
                type="button"
                className={`${btnSecondary} mt-2`}
                onClick={props.onResendSetPassword}
              >
                Resend set-password email
              </button>
            </div>
          ) : null}

          {pendingBrokered ? (
            <div className="mt-3 rounded-lg border border-input p-3">
              <p className="text-xs text-muted-foreground">
                Last sent{" "}
                {fmtDateTime(person.invitationSentAt, viewer.timeZone, "never")}
              </p>
              <button
                type="button"
                className={`${btnSecondary} mt-2`}
                onClick={props.onResendInvitation}
              >
                Resend invitation
              </button>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2 border-t border-input pt-3">
            {person.status === "disabled" ? (
              <button
                type="button"
                className={btnSecondary}
                onClick={props.onEnable}
              >
                Re-enable
              </button>
            ) : (
              <button
                type="button"
                className={btnSecondary}
                disabled={blocked}
                title={blocked ? blockedReason : undefined}
                onClick={props.onDisable}
              >
                Disable
              </button>
            )}
            <button
              type="button"
              className={btnDanger}
              disabled={blocked}
              title={blocked ? blockedReason : undefined}
              onClick={props.onRemove}
            >
              <TrashIcon /> Remove
            </button>
          </div>

          {blocked ? (
            <p className="mt-2 text-sm text-foreground">{blockedReason}</p>
          ) : null}
        </div>
      ) : null}

      {tab === "groups" ? (
        <div className="mt-2">
          <ul className="divide-y divide-input">
            {person.groups.map((group) => (
              <li key={group.id} className="py-2 text-sm text-foreground">
                <span className="font-medium">{group.label}</span>{" "}
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
        </div>
      ) : null}

      {tab === "roles" ? (
        <div className="mt-2">
          <ul className="divide-y divide-input">
            {person.assignments.map((assignment) => (
              <li key={assignment.id} className="py-2 text-sm text-foreground">
                <span className="font-medium">{assignment.roleName}</span>
                <span className="text-muted-foreground">
                  {" "}
                  ·{" "}
                  {assignment.source === "direct"
                    ? "Direct"
                    : `via ${assignment.groupName ?? "a group"}`}
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
            <button
              type="button"
              className={`${btnSecondary} mt-3`}
              onClick={props.onManageAccess}
            >
              <ShieldIcon /> Manage in Access
            </button>
          )}
          <HelpDisclosure label="How this adds up">
            A role held directly is this person&apos;s. A role held through a
            group changes for every member of that group.
          </HelpDisclosure>
        </div>
      ) : null}

      {tab === "sessions" ? (
        <div className="mt-2">
          <ul className="divide-y divide-input">
            {person.sessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center justify-between py-2 text-sm text-foreground"
              >
                <span>
                  {session.device} · {session.browser}
                  <span className="block text-xs text-muted-foreground">
                    {session.ipAddress} · last active{" "}
                    {fmtDateTime(session.lastActiveAt, viewer.timeZone, "")}
                  </span>
                </span>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => props.onRevokeSession(session.id)}
                >
                  Sign out
                </button>
              </li>
            ))}
            {person.sessions.length === 0 ? (
              <li className="py-2 text-sm text-muted-foreground">
                This person has no open session.
              </li>
            ) : null}
          </ul>
          {person.sessions.length === 0 ? null : (
            <button
              type="button"
              className={`${btnGhost} mt-3`}
              onClick={props.onRevokeAllSessions}
            >
              Sign out all
            </button>
          )}
        </div>
      ) : null}
    </SlideOver>
  );
}

function ProfileRow(props: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="text-foreground">{props.value}</dd>
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
  const [sort, setSort] = useState<"name" | "status" | "lastSignIn">("name");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | PersonStatus>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [confirm, setConfirm] = useState<{
    readonly kind: "disable" | "remove";
    readonly person: Person;
  } | null>(null);

  const groupOptions = useMemo(() => {
    const seen = new Map<string, string>();

    for (const person of props.people) {
      for (const group of person.groups) seen.set(group.id, group.label);
    }

    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [props.people]);

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

  const selected = props.details?.[selectedId ?? ""];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="relative block">
            <span className="sr-only">Search people</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <SearchIcon />
            </span>
            <input
              className={`${inputClass} w-72 pl-9`}
              aria-label="Search people"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <HelpDisclosure label="Pending, disabled, removed">
            Pending ends at first sign-in. Disable keeps history; Remove ends
            sessions and bans. Replacing a name with an anonymous one is an
            operator command.
          </HelpDisclosure>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-foreground">
            <span className="mr-2">Sort</span>
            <select
              className={inputClass}
              aria-label="Sort people"
              value={sort}
              onChange={(event) => {
                // SAFETY: the options below offer exactly these three sort keys.
                setSort(event.target.value as typeof sort);
              }}
            >
              <option value="name">Name</option>
              <option value="status">Status</option>
              <option value="lastSignIn">Last sign-in</option>
            </select>
          </label>
          <button
            type="button"
            className={btnSecondary}
            aria-expanded={showFilters}
            onClick={() => setShowFilters((value) => !value)}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => setAdding(true)}
          >
            <PlusIcon /> Add person
          </button>
        </div>
      </div>

      {showFilters ? (
        <div className="mt-2 flex flex-wrap gap-3 rounded-lg border border-input p-3">
          <label className="text-sm text-foreground">
            <span className="mb-1 block text-xs font-semibold">Status</span>
            <select
              className={inputClass}
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => {
                // SAFETY: the options below offer exactly these status keys.
                setStatusFilter(event.target.value as typeof statusFilter);
              }}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <label className="text-sm text-foreground">
            <span className="mb-1 block text-xs font-semibold">Group</span>
            <select
              className={inputClass}
              aria-label="Filter by group"
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
            >
              <option value="all">All</option>
              {groupOptions.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

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
          <button type="button" className={btnGhost} onClick={clearFilters}>
            Clear all
          </button>
        </div>
      )}

      {props.error === undefined ? null : (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {props.error}
        </p>
      )}

      {props.loading ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading people…
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No people match.{" "}
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              setQuery("");
              clearFilters();
            }}
          >
            Clear filters
          </button>
        </p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-muted-foreground">
              <th className="py-2">Person</th>
              <th className="py-2">Status</th>
              <th className="py-2">Groups</th>
              <th className="py-2">Roles</th>
              <th className="py-2">Last sign-in</th>
              <th className="py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-input">
            {filtered.map((person) => {
              const self = person.id === props.viewer.id;

              const lastAdministrator =
                props.lastAdministratorPersonIds.includes(person.id);

              const blockedReason = self ? SELF_REASON : LAST_ADMIN_REASON;

              return (
                <tr key={person.id}>
                  <td className="py-2">
                    <button
                      type="button"
                      className={`${btnGhost} h-auto flex-col items-start text-left`}
                      onClick={() => {
                        setSelectedId(person.id);
                        props.onSelectPerson?.(person.id);
                      }}
                    >
                      <span className="font-semibold text-foreground">
                        {initials(person.name)}
                      </span>
                      <span>{person.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {person.email}
                      </span>
                    </button>
                  </td>
                  <td className="py-2">{statusPill(person.status)}</td>
                  <td className="py-2">
                    <span className="flex flex-wrap items-center gap-1">
                      {person.groups.slice(0, 2).map((group) => (
                        <Pill key={group.id} tone="info">
                          {group.label}
                        </Pill>
                      ))}
                      {person.groups.length > 2 ? (
                        <span className="text-xs text-muted-foreground">
                          +{person.groups.length - 2}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="py-2 text-foreground">{person.roleCount}</td>
                  <td className="py-2 text-muted-foreground">
                    {fmtDateTime(
                      person.lastSignInAt,
                      props.viewer.timeZone,
                      "—"
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <RowMenu
                      person={person}
                      self={self}
                      lastAdministrator={lastAdministrator}
                      blockedReason={
                        self || lastAdministrator ? blockedReason : undefined
                      }
                      onDisable={() => setConfirm({ kind: "disable", person })}
                      onEnable={() => props.onEnablePerson?.(person.id)}
                      onRemove={() => setConfirm({ kind: "remove", person })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {adding ? (
        <AddPersonDialog
          settings={props.settings}
          roles={props.roles}
          onCancel={() => setAdding(false)}
          onSubmit={(input) => {
            props.onAddPerson?.(input);
            setAdding(false);
          }}
        />
      ) : null}

      {selected === undefined ? null : (
        <PersonInspector
          person={selected}
          viewer={props.viewer}
          self={selected.id === props.viewer.id}
          lastAdministrator={props.lastAdministratorPersonIds.includes(
            selected.id
          )}
          onClose={() => {
            setSelectedId(null);
            props.onSelectPerson?.(null);
          }}
          onDisable={() => setConfirm({ kind: "disable", person: selected })}
          onEnable={() => props.onEnablePerson?.(selected.id)}
          onRemove={() => setConfirm({ kind: "remove", person: selected })}
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

      {confirm === null ? null : (
        <ConfirmDialog
          title={
            confirm.kind === "disable"
              ? `Disable ${confirm.person.name}?`
              : `Remove ${confirm.person.name}?`
          }
          consequence={
            confirm.kind === "disable"
              ? "They can no longer sign in but keep their history and their roles."
              : "Every session ends, they are banned from signing in again, and their group memberships and direct roles go. Their name, email and audit trail stay."
          }
          confirmLabel={
            confirm.kind === "disable" ? "Disable" : "Remove person"
          }
          onConfirm={() => {
            const request = confirm;
            setConfirm(null);

            if (request.kind === "disable") {
              props.onDisablePerson?.(request.person.id);
            } else {
              props.onRemovePerson?.(request.person.id);
            }
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
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
        className={btnGhost}
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
  readonly settings: PeopleScreenProps["settings"];
  readonly roles: readonly AssignableRole[];
  readonly onCancel: () => void;
  readonly onSubmit: (input: NewPersonInput) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleIds, setRoleIds] = useState<readonly string[]>([]);
  const [accountType, setAccountType] = useState<AccountType>("brokered");
  const [sendInvitation, setSendInvitation] = useState(true);

  const localAvailable = props.settings.localAccountsEnabled;

  const brokered = !localAvailable || accountType === "brokered";

  return (
    // On a phone the dialog is a bottom sheet whose body scrolls and whose footer stays put, so
    // the primary action is reachable on a short viewport (DEC-25). On a wider screen it is a
    // centered card capped to the viewport.
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add person"
        className="flex max-h-screen w-full max-w-md flex-col rounded-t-xl bg-white shadow-xl sm:rounded-xl dark:bg-card"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <h2 className="text-lg font-semibold text-foreground">Add person</h2>
          <div className="mt-3 space-y-3">
            <Field label="Email">
              <input
                className={inputClass}
                aria-label="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="Display name">
              <input
                className={inputClass}
                aria-label="Display name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Roles">
              <select
                multiple
                className={`${inputClass} h-28`}
                aria-label="Roles"
                value={[...roleIds]}
                onChange={(event) =>
                  setRoleIds(
                    [...event.target.selectedOptions].map(
                      (option) => option.value
                    )
                  )
                }
              >
                {props.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </Field>

            {localAvailable ? (
              <fieldset>
                <legend className="mb-1 text-xs font-semibold text-foreground">
                  Account type
                </legend>
                <label className="mr-4 inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="account-type"
                    value="brokered"
                    checked={accountType === "brokered"}
                    onChange={() => setAccountType("brokered")}
                  />
                  Identity provider
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="account-type"
                    value="local"
                    checked={accountType === "local"}
                    onChange={() => setAccountType("local")}
                  />
                  Local password
                </label>
              </fieldset>
            ) : null}

            {localAvailable && accountType === "local" ? (
              <p className="text-sm text-muted-foreground">
                A separate email sets this person&apos;s password.
              </p>
            ) : null}

            {brokered ? (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={sendInvitation}
                  onChange={(event) => setSendInvitation(event.target.checked)}
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
        </div>
        <div className="flex justify-end gap-2 border-t border-input p-5">
          <button
            type="button"
            className={btnSecondary}
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={email.trim() === ""}
            onClick={() =>
              props.onSubmit({
                email: email.trim(),
                name: name.trim() === "" ? undefined : name.trim(),
                roleIds,
                accountType: localAvailable ? accountType : undefined,
                sendInvitation: brokered ? sendInvitation : undefined,
              })
            }
          >
            Add person
          </button>
        </div>
      </div>
    </div>
  );
}
