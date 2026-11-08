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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  FilterDisclosure,
  focusRing,
  FormActionBar,
  HelpDisclosure,
  InfoNote,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
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
  StickyActionBar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type DataTableAction,
} from "@genie/ui";
import {
  Fragment,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { GrantRow } from "../../services/roles/grants.ts";
import {
  AccessPathList,
  type InspectorAccess,
} from "../access/access-path-list.tsx";
import { useDialogSubmit } from "../admin/dialog-submit.ts";
import {
  DirectoryIcon,
  LocalIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  KeyIcon,
} from "../admin/icons.tsx";
import { NoMatch } from "../admin/no-match.tsx";
import {
  fmtDateTime as fmtDayAndTime,
  initials,
  relativeTime,
} from "../audit/helpers.ts";
import { GroupName } from "../groups/group-name.tsx";
import type {
  AccountType,
  NewPersonInput,
  PeopleScreenProps,
  PeopleViewer,
  Person,
  PersonDetail,
  PersonGroupOption,
  PersonStatus,
} from "./types.ts";

/** The stable refusal reason the server mirrors (R-38). */
export const LAST_ADMIN_REASON =
  "This would leave no active tenant administrator";

export const SELF_REASON =
  "You cannot change your own access. Ask another administrator.";

/** The line above Disable and Remove; a refusal takes its place (design captures). */
export const DISABLE_REMOVE_NOTE =
  "Disabling keeps history and assignments. Removing drops their groups and direct roles and keeps their name and audit trail.";

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

/** "1 h ago", "2 d ago", a date after 30 days, or "Never" (design mockups). */
function signedInAgo(iso: string | null, viewer: PeopleViewer): string {
  if (iso === null) return "Never";

  return relativeTime(iso, new Date(viewer.nowIso), viewer.timeZone);
}

/** "1 Aug, 09:00" in the current year, with the year once older (design mockup). */
function signedInOn(iso: string | null, viewer: PeopleViewer): string {
  if (iso === null) return "Never";

  return new Date(iso).getUTCFullYear() ===
    new Date(viewer.nowIso).getUTCFullYear()
    ? fmtDayAndTime(iso, viewer.timeZone)
    : fmtDateTime(iso, viewer.timeZone, "Never");
}

const ONBOARDING_LABEL: Record<
  PeopleScreenProps["settings"]["onboardingMode"],
  string
> = {
  invite: "Invite only",
  jit: "Just-in-time",
};

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

const TABS = ["profile", "groups", "access", "sessions"] as const;

type ConfirmKind = "disable" | "remove";

function statusPill(status: PersonStatus) {
  return (
    <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>
  );
}

function groupPills(person: Person) {
  if (person.groups.length === 0)
    return <span className="text-muted-foreground">—</span>;

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
  return accountType === "local"
    ? "Local password"
    : "Brokered through the identity provider";
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
 * The person inspector: header, Profile, Groups, Access and Sessions tabs (R-37). The Access tab
 * shows only when the host passes the access read. The app passes it to every viewer of People,
 * read-only, and passes Manage in Access only with the Roles key (LK4, `d8l5.43`). Disable and
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
  /** The person's access from the S2-19 read; undefined hides the Access tab. */
  readonly access?: InspectorAccess | undefined;
  readonly onManageAccess?: (() => void) | undefined;
  /** Opens the group a role comes through; without it the group name is plain text. */
  readonly onOpenGroup?: ((groupId: string) => void) | undefined;
  /** The local groups Add to group offers; with the two callbacks only for a group manager (G16). */
  readonly localGroups?: readonly PersonGroupOption[] | undefined;
  readonly onAddToGroup?: ((groupId: string) => void) | undefined;
  readonly onRemoveFromGroup?: ((groupId: string) => void) | undefined;
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
        {/* The status pill sits beside the name and the email under it, as the capture draws it. */}
        <SheetHeader>
          <div className="flex items-center gap-3">
            <Avatar size="lg" aria-hidden="true">
              <AvatarFallback>{initials(person.name)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <SheetTitle className="min-w-0 wrap-anywhere">
                  {person.name}
                </SheetTitle>
                {statusPill(person.status)}
              </div>
              <span className="text-sm text-muted-foreground wrap-anywhere">
                {person.email}
              </span>
            </div>
          </div>
        </SheetHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
          <Tabs
            value={tab}
            onValueChange={(value) =>
              setTab(TABS.find((key) => key === value) ?? "profile")
            }
          >
            <TabsList aria-label="Person detail">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              {/* The captures show each count as a gray pill beside the label. */}
              <TabsTrigger value="groups">
                Groups <LabelPill>{person.groups.length}</LabelPill>
              </TabsTrigger>
              {props.access === undefined ? null : (
                <TabsTrigger value="access">
                  Access{" "}
                  {props.access.paths === undefined ? null : (
                    <LabelPill>{props.access.paths.length}</LabelPill>
                  )}
                </TabsTrigger>
              )}
              <TabsTrigger value="sessions">
                Sessions <LabelPill>{person.sessions.length}</LabelPill>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
                <ProfileRow label="Name" value={person.name} />
                <ProfileRow label="Email" value={person.email} />
                <ProfileRow
                  label="Account"
                  value={accountTypeLabel(person.accountType)}
                />
                <ProfileRow
                  label="Identity source"
                  value={person.identitySource}
                />
                <ProfileRow
                  label="Onboarding"
                  value={
                    person.onboarding === "jit"
                      ? "Joined at first sign-in"
                      : "Added by an administrator"
                  }
                />
                <ProfileRow
                  label="First sign-in"
                  value={signedInOn(person.firstSignInAt, viewer)}
                />
                <ProfileRow
                  label="Last sign-in"
                  value={signedInAgo(person.lastSignInAt, viewer)}
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
            </TabsContent>

            <TabsContent value="groups">
              <PersonGroups
                groups={person.groups}
                viewer={viewer}
                localGroups={props.localGroups}
                onAddToGroup={props.onAddToGroup}
                onRemoveFromGroup={props.onRemoveFromGroup}
                pending={props.pending}
              />
            </TabsContent>

            {props.access === undefined ? null : (
              <TabsContent value="access">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      Everything this person can do, and where each grant comes
                      from. Read-only here.
                    </p>
                    <HelpDisclosure label="How this adds up">
                      A role held directly belongs to this person. A role held
                      through a group stays while they are a member of that
                      group.
                    </HelpDisclosure>
                  </div>
                  {props.onManageAccess === undefined ? null : (
                    <Button variant="secondary" onClick={props.onManageAccess}>
                      <KeyIcon /> Manage in Access
                    </Button>
                  )}
                </div>
                <AccessPathList
                  {...props.access}
                  recipient={{ type: "user", id: person.id }}
                  empty="This person holds no role yet."
                  onOpenGroup={props.onOpenGroup}
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Access is granted and taken back in one place, the Access
                  screen. A role held through a group changes for every member
                  of that group.
                </p>
              </TabsContent>
            )}

            <TabsContent value="sessions">
              <PersonSessions
                sessions={person.sessions}
                viewer={viewer}
                pending={props.pending}
                onRevokeSession={props.onRevokeSession}
                onRevokeAllSessions={props.onRevokeAllSessions}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* The captures pin Disable and Remove under every tab, with the refusal above them. */}
        <div className="mt-auto flex flex-col gap-2 border-t border-border p-4">
          {blocked ? (
            <p className="text-sm text-foreground">{blockedReason}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {DISABLE_REMOVE_NOTE}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
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
              variant="danger-outline"
              disabled={blocked}
              title={blocked ? blockedReason : undefined}
              loading={props.pending}
              onClick={() => setConfirm("remove")}
            >
              Remove
            </Button>
          </div>
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

/** The Sessions tab: each open session with its own sign-out, then Sign out all. */
function PersonSessions(props: {
  readonly sessions: PersonDetail["sessions"];
  readonly viewer: PeopleViewer;
  readonly pending?: boolean | undefined;
  readonly onRevokeSession: (sessionId: string) => void;
  readonly onRevokeAllSessions: () => void;
}) {
  return (
    <>
      <ul className="divide-y divide-border">
        {props.sessions.map((session) => (
          <li
            key={session.id}
            className="flex items-center justify-between gap-2 py-2 text-sm text-foreground"
          >
            <span className="min-w-0 wrap-anywhere">
              {session.device} · {session.browser}
              <span className="block text-xs text-muted-foreground">
                {session.ipAddress} · last active{" "}
                {signedInAgo(session.lastActiveAt, props.viewer)}
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
        {props.sessions.length === 0 ? (
          <li className="py-2 text-sm text-muted-foreground">
            No active sessions.
          </li>
        ) : null}
      </ul>
      {props.sessions.length === 0 ? null : (
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
    </>
  );
}

/**
 * The Groups tab: directory groups, then local groups, each under its own heading. With the group
 * callbacks (a caller who manages groups), each local group has Remove and Add to group picks a
 * local group the person is not in (design spec, Groups tab; G16). Directory membership stays
 * read-only: the identity provider owns it.
 */
function PersonGroups(props: {
  readonly groups: PersonDetail["groups"];
  readonly viewer: PeopleViewer;
  readonly localGroups?: readonly PersonGroupOption[] | undefined;
  readonly onAddToGroup?: ((groupId: string) => void) | undefined;
  readonly onRemoveFromGroup?: ((groupId: string) => void) | undefined;
  readonly pending?: boolean | undefined;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const pickerId = useId();

  const choices = (props.localGroups ?? []).filter(
    (option) => !props.groups.some((group) => group.id === option.id)
  );

  const choiceItems = choices.map((option) => ({
    value: option.id,
    label: option.label,
  }));

  const picker =
    props.onAddToGroup === undefined || choices.length === 0 ? null : (
      <div className="flex flex-wrap items-end gap-2">
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor={pickerId}>Add to group</FieldLabel>
          <Select
            items={choiceItems}
            value={choice}
            onValueChange={(value) => setChoice(value)}
          >
            <SelectTrigger id={pickerId}>
              <SelectValue placeholder="Choose a local group" />
            </SelectTrigger>
            <SelectContent>
              {choiceItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button
          variant="secondary"
          disabled={choice === null}
          loading={props.pending}
          onClick={() => {
            if (choice === null) return;

            props.onAddToGroup?.(choice);
            setChoice(null);
          }}
        >
          <PlusIcon /> Add
        </Button>
      </div>
    );

  if (props.groups.length === 0)
    return (
      <div className="flex flex-col gap-3">
        <p className="py-2 text-sm text-muted-foreground">
          This person is in no group.
        </p>
        {picker}
      </div>
    );

  const sections = [
    { source: "idp", title: "Directory groups", Icon: DirectoryIcon },
    { source: "local", title: "Local groups", Icon: LocalIcon },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      {sections.map(({ source, title, Icon }) => {
        const groups = props.groups.filter((group) => group.source === source);

        if (groups.length === 0) return null;

        // Sign-in refreshes every directory group at once, so one time heads the section.
        const syncedAt =
          groups
            .flatMap((group) =>
              group.syncedAt === null ? [] : [group.syncedAt]
            )
            .toSorted()
            .at(-1) ?? null;

        return (
          <section key={source} aria-label={title}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              {source === "idp" && syncedAt !== null ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  Synced {signedInAgo(syncedAt, props.viewer)}
                </span>
              ) : null}
            </div>
            {source === "idp" ? (
              <p className="text-xs text-muted-foreground">
                Membership is managed in the identity provider and refreshed at
                every sign-in.
              </p>
            ) : null}
            <ul className="mt-1">
              {groups.map((group) => (
                <li
                  key={group.id}
                  className="flex items-center gap-2 py-1.5 text-sm text-foreground"
                >
                  <Icon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <GroupName value={group.label} />
                  </span>
                  {source === "local" &&
                  props.onRemoveFromGroup !== undefined ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove from ${group.label}`}
                      loading={props.pending}
                      onClick={() => props.onRemoveFromGroup?.(group.id)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {picker}
    </div>
  );
}

/** One label and value; the label column is fixed, the value starts at its right (capture). */
function ProfileRow(props: { readonly label: string; readonly value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="col-span-2 min-w-0 text-foreground wrap-anywhere">
        {props.value}
      </dd>
    </>
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
    signedInAgo(person.lastSignInAt, props.viewer);

  const selected = props.details?.[selectedId ?? ""];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <label htmlFor={searchId} className="sr-only">
            {props.searchLabel}
          </label>
          {/* The captures draw a magnifier inside every list search. */}
          <InputGroup className="min-w-0 flex-1 sm:w-72 sm:flex-none">
            <InputGroupInput
              id={searchId}
              placeholder={props.searchLabel}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <InputGroupAddon>
              <InputGroupText>
                <SearchIcon aria-hidden="true" />
              </InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <HelpDisclosure label="Pending, disabled, removed" iconOnly>
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
          <Button className="max-md:hidden" onClick={() => setAdding(true)}>
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
              // The capture puts Status right after Person.
              {
                id: "status",
                header: "Status",
                cell: (person) => statusPill(person.status),
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
            card={{
              media: (person) => (
                <Avatar size="lg" aria-hidden="true">
                  <AvatarFallback>{initials(person.name)}</AvatarFallback>
                </Avatar>
              ),
              title: (person) => person.name,
              badge: (person) => statusPill(person.status),
              detail: (person) => person.email,
              facts: (person) => [
                `${person.roleCount} role${person.roleCount === 1 ? "" : "s"}`,
                `last sign-in ${lastSignIn(person)}`,
              ],
            }}
            actions={rowActions}
            footer={
              <>
                <span>
                  {filtered.length} of {props.people.length}{" "}
                  {props.people.length === 1 ? "person" : "people"}
                </span>
                {/* No setting names the provider yet, so the generic source stands (G13). */}
                <span>
                  Onboarding: {ONBOARDING_LABEL[props.settings.onboardingMode]}{" "}
                  · External identity provider
                </span>
              </>
            }
          />
        </div>
      )}

      <StickyActionBar>
        <Button onClick={() => setAdding(true)}>
          <PlusIcon /> Add person
        </Button>
      </StickyActionBar>

      <AddPersonDialog
        open={adding}
        settings={props.settings}
        grantRows={props.grantRows}
        canAssignRoles={props.canAssignRoles}
        error={addForm.failure ?? undefined}
        emailError={
          addForm.issues.find((issue) => issue.path === "email")?.message
        }
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
          access={props.access}
          onManageAccess={
            props.onManageAccess === undefined
              ? undefined
              : () => props.onManageAccess?.(selected.id)
          }
          onOpenGroup={props.onOpenGroup}
          localGroups={props.localGroups}
          onAddToGroup={
            props.onAddToGroup === undefined
              ? undefined
              : (targetGroupId) =>
                  props.onAddToGroup?.(selected.id, targetGroupId)
          }
          onRemoveFromGroup={
            props.onRemoveFromGroup === undefined
              ? undefined
              : (targetGroupId) =>
                  props.onRemoveFromGroup?.(selected.id, targetGroupId)
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

/** More switched-on modules than this get a "Find a module" field (prototype variant A). */
const FINDER_THRESHOLD = 6;

/** What the picks give, for the footer: the row names, or a count past three (variant A). */
function accessSummary(names: readonly string[]): ReactNode {
  if (names.length === 0) return "No access yet";

  if (names.length > 3) {
    return (
      <>
        Access to <strong>{names.length} modules</strong>
      </>
    );
  }

  const last = names.length - 1;

  return (
    <>
      Access to{" "}
      {names.map((name, index) => (
        <Fragment key={name}>
          {index === 0 ? "" : index === last ? " and " : ", "}
          <strong className="font-semibold text-foreground">{name}</strong>
        </Fragment>
      ))}
    </>
  );
}

/** One Grants row of Access now: its name and line, and a role choice that starts at No access. */
function AccessNowRow(props: {
  readonly row: GrantRow;
  readonly value: string | null;
  readonly onChange: (roleId: string | null) => void;
}) {
  const triggerId = useId();

  // The Grants catalogue lists the default access role first (P3), so it leads after No access.
  const items = [
    { value: null, label: "No access" },
    ...props.row.roles.map((role) => ({
      value: role.id,
      label:
        role.id === props.row.defaultRoleId
          ? `${role.name} (default)`
          : role.name,
    })),
  ];

  return (
    <li
      className={`flex flex-col gap-2 border-t border-border px-3.5 py-2.5 first:rounded-t-xl first:border-t-0 last:rounded-b-xl md:flex-row md:items-center md:gap-3 ${props.value === null ? "" : "bg-muted"}`}
    >
      <label htmlFor={triggerId} className="flex min-w-0 flex-col md:flex-1">
        <span className="text-sm font-semibold text-foreground">
          {props.row.name}
        </span>
        {props.row.description === null ? null : (
          <span className="text-xs text-muted-foreground">
            {props.row.description}
          </span>
        )}
      </label>
      <div className="md:w-56 md:shrink-0">
        <Select
          items={items}
          value={props.value}
          onValueChange={(roleId: string | null) => props.onChange(roleId)}
        >
          <SelectTrigger
            id={triggerId}
            aria-label={`Role for ${props.row.name}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value ?? "none"} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </li>
  );
}

/** The Add person dialog (R-40, R-40a, design: `add-person.prototype.html` variant A, d8l5.44). */
export function AddPersonDialog(props: {
  readonly open?: boolean;
  readonly settings: PeopleScreenProps["settings"];
  /** The Grants rows (R-37a): one role choice per switched-on module and Ask. */
  readonly grantRows: readonly GrantRow[];
  /** False hides the role picker for a holder of `core:people:manage` alone (DEC-39). */
  readonly canAssignRoles?: boolean | undefined;
  /** The catalogue message of a refusal, shown in the alert; the dialog stays open. */
  readonly error?: string | undefined;
  /** A refusal's issue at the email field (R-40b), shown under it in place of the alert. */
  readonly emailError?: string | undefined;
  readonly submitting?: boolean | undefined;
  readonly onCancel: () => void;
  readonly onSubmit: (input: NewPersonInput) => void;
}) {
  const open = props.open ?? true;
  const [email, setEmail] = useState("");
  // The address the last submit sent, so an edit after a refusal drops its field error.
  const [submittedEmail, setSubmittedEmail] = useState("");
  const emailInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  // The picked role of each Grants row, by row id. A row with no entry has No access.
  const [picks, setPicks] = useState<Readonly<Record<string, string>>>({});
  const [moduleQuery, setModuleQuery] = useState("");
  const [openInAccess, setOpenInAccess] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("brokered");
  const [sendInvitation, setSendInvitation] = useState(true);
  const emailId = useId();
  const nameId = useId();
  const hintId = useId();
  const modulesId = useId();
  const coreId = useId();
  const accountTypeId = useId();

  // The dialog stays mounted, so each open starts from an empty form.
  useEffect(() => {
    if (!open) return;

    setEmail("");
    setName("");
    setPicks({});
    setModuleQuery("");
    setOpenInAccess(false);
    setAccountType("brokered");
    setSendInvitation(true);
  }, [open]);

  const emailError =
    email.trim() === submittedEmail ? props.emailError : undefined;

  const emailErrorId =
    emailError === undefined ? undefined : `${emailId}-error`;

  // U-1: a refusal at the field takes the focus there.
  useEffect(() => {
    if (props.emailError !== undefined) emailInput.current?.focus();
  }, [props.emailError]);

  const localAvailable = props.settings.localAccountsEnabled;

  const canAssignRoles = props.canAssignRoles ?? true;

  const brokered = !localAvailable || accountType === "brokered";

  const showPicker = canAssignRoles && props.grantRows.length > 0;

  const modules = props.grantRows.filter(
    (row) => row.group === "modules" && row.enabled
  );

  const switchedOff = props.grantRows.filter(
    (row) => row.group === "modules" && !row.enabled
  );

  const core = props.grantRows.filter((row) => row.group === "core");

  const showFinder = modules.length > FINDER_THRESHOLD;

  const term = showFinder ? moduleQuery.trim().toLowerCase() : "";

  // The finder only hides rows; a hidden row keeps its pick.
  const shownModules = modules.filter((row) =>
    row.name.toLowerCase().includes(term)
  );

  const picked = [...modules, ...core].filter(
    (row) => picks[row.id] !== undefined
  );

  const pick = (rowId: string, roleId: string | null) =>
    setPicks((current) => {
      const { [rowId]: _replaced, ...rest } = current;

      return roleId === null ? rest : { ...rest, [rowId]: roleId };
    });

  const row = (entry: GrantRow) => (
    <AccessNowRow
      key={entry.id}
      row={entry}
      value={picks[entry.id] ?? null}
      onChange={(roleId) => pick(entry.id, roleId)}
    />
  );

  const groupHeading =
    "mt-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) props.onCancel();
      }}
    >
      {/* 560 px from 768 px. Below it the dialog is the full-width bottom sheet, up to the screen
          height, with the actions fixed under the thumb (FormActionBar `dialog`). */}
      <DialogContent className="md:w-140">
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
          {/* No setting names the provider yet, so the generic word stands (G13). */}
          <DialogDescription>
            They sign in with their identity provider account. Access you choose
            now applies at first sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor={emailId}>Work email</FieldLabel>
            <Input
              ref={emailInput}
              id={emailId}
              placeholder="name@company.example"
              value={email}
              aria-invalid={emailError !== undefined}
              aria-describedby={emailErrorId}
              onChange={(event) => setEmail(event.target.value)}
            />
            {emailError === undefined ? null : (
              <FieldError id={emailErrorId}>{emailError}</FieldError>
            )}
          </Field>
          <Field>
            {/* "(optional)" sits beside the label, not in it, so the field's name stays short. */}
            <span className="flex items-baseline gap-1">
              <FieldLabel htmlFor={nameId}>Display name</FieldLabel>
              <span className="text-xs text-muted-foreground">(optional)</span>
            </span>
            <Input
              id={nameId}
              placeholder="Filled from the directory at first sign-in"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          {showPicker ? (
            <fieldset
              aria-describedby={hintId}
              className="flex min-w-0 flex-col gap-2.5"
            >
              <legend className="mb-0.5 text-sm font-semibold text-foreground">
                Access now{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (optional)
                </span>
              </legend>
              <p id={hintId} className="text-sm text-muted-foreground">
                One role per module. Each module starts at No access; the first
                role listed is the module&apos;s default.
              </p>
              {showFinder ? (
                <InputGroup>
                  <InputGroupInput
                    type="search"
                    aria-label="Find a module"
                    placeholder="Find a module"
                    autoComplete="off"
                    value={moduleQuery}
                    onChange={(event) => setModuleQuery(event.target.value)}
                  />
                  <InputGroupAddon>
                    <InputGroupText>
                      <SearchIcon aria-hidden="true" />
                    </InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              ) : null}
              {modules.length === 0 ? null : (
                <>
                  <p id={modulesId} className={groupHeading}>
                    Modules · {modules.length}
                  </p>
                  {shownModules.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No module matches “{moduleQuery.trim()}”.
                    </p>
                  ) : (
                    <ul
                      aria-labelledby={modulesId}
                      className="rounded-xl border border-border"
                    >
                      {shownModules.map(row)}
                    </ul>
                  )}
                </>
              )}
              {switchedOff.length === 0 ? null : (
                <p className="text-sm text-muted-foreground">
                  Switched off:{" "}
                  {switchedOff.map((entry) => entry.name).join(", ")}. Switch a
                  module on in Modules before you give access to it.
                </p>
              )}
              {core.length === 0 ? null : (
                <>
                  <p id={coreId} className={groupHeading}>
                    Core · {core.length}
                  </p>
                  <ul
                    aria-labelledby={coreId}
                    className="rounded-xl border border-border"
                  >
                    {core.map(row)}
                  </ul>
                </>
              )}
              <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-muted px-3.5 py-3">
                <p className="flex gap-2 text-sm text-foreground">
                  <ShieldIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  Administration roles (Tenant administrator, Auditor) are added
                  in Access.
                </p>
                <label className="flex min-h-11 items-center gap-2 text-sm text-foreground lg:min-h-0">
                  <Checkbox
                    checked={openInAccess}
                    onCheckedChange={setOpenInAccess}
                  />
                  Open in Access after adding
                </label>
              </div>
            </fieldset>
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

          <InfoNote>
            {props.settings.onboardingMode === "jit" ? (
              "People in a group mapped to a role can also sign in without being added here."
            ) : (
              <>
                The person shows as{" "}
                <StatusPill tone="neutral">Pending</StatusPill> until their
                first sign-in.
              </>
            )}
          </InfoNote>
        </div>
        {/* A refused add reports in the action bar, beside the buttons, and keeps the form. A
            refusal at the email field reports there only. */}
        <FormActionBar
          failure={
            props.emailError === undefined ? (props.error ?? null) : null
          }
          placement="dialog"
          status={
            showPicker
              ? accessSummary(picked.map((entry) => entry.name))
              : undefined
          }
        >
          <Button variant="secondary" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button
            disabled={email.trim() === ""}
            loading={props.submitting === true}
            onClick={() => {
              setSubmittedEmail(email.trim());
              props.onSubmit({
                email: email.trim(),
                name: name.trim() === "" ? undefined : name.trim(),
                // One role per picked row, in row order (R-40).
                roleIds: canAssignRoles
                  ? picked.flatMap((entry) => picks[entry.id] ?? [])
                  : [],
                openInAccess: canAssignRoles && openInAccess,
                accountType: localAvailable ? accountType : undefined,
                sendInvitation: brokered ? sendInvitation : undefined,
              });
            }}
          >
            Add person
          </Button>
        </FormActionBar>
      </DialogContent>
    </Dialog>
  );
}
