"use client";

import {
  Avatar,
  AvatarFallback,
  Button,
  Checkbox,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FieldDescription,
  FieldLabel,
  FormActionBar,
  HelpDisclosure,
  IconTile,
  Input,
  LabelPill,
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
} from "@genie/ui";
import { EllipsisIcon } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useDialogSubmit } from "../admin/dialog-submit.ts";
import {
  ArchiveIcon,
  DirectoryIcon,
  LocalIcon,
  PencilIcon,
  PlusIcon,
  ShieldIcon,
  TrashIcon,
  WarningIcon,
} from "../admin/icons.tsx";
import { NoMatch } from "../admin/no-match.tsx";
import { initials } from "../audit/helpers.ts";
import { GroupName, looksLikeId } from "./group-name.tsx";
import {
  groupLabel,
  type Group,
  type GroupInspectorProps,
  type GroupsScreenProps,
  type GroupsViewer,
} from "./types.ts";

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

function sourcePill(group: Group) {
  return group.source === "idp" ? (
    <LabelPill>
      <DirectoryIcon className="mr-1 size-3" /> Directory
    </LabelPill>
  ) : (
    <LabelPill>
      <LocalIcon className="mr-1 size-3" /> Local
    </LabelPill>
  );
}

/** The state a directory group carries as a pill; a fresh group carries none (its facts line dates the sync). */
function syncPill(group: Group) {
  if (group.archived) return <StatusPill tone="neutral">Archived</StatusPill>;

  if (group.source !== "idp") return null;

  if (group.lastSeenAt === null)
    return <StatusPill tone="neutral">Not seen yet</StatusPill>;

  if (group.stale) {
    return (
      <StatusPill tone="warning">
        <WarningIcon className="mr-1 size-3" /> Stale
      </StatusPill>
    );
  }

  return null;
}

/** The table's Status column: the state pill, or the sync date when the group is fresh. */
function syncBadge(group: Group, viewer: GroupsViewer) {
  const pill = syncPill(group);

  if (pill !== null) return pill;

  if (group.source !== "idp" || group.lastSeenAt === null) return null;

  return (
    <span className="text-xs text-muted-foreground">
      Synced {fmtDateTime(group.lastSeenAt, viewer.timeZone, "never")}
    </span>
  );
}

const LAST_ADMIN_REASON = "This would leave no active tenant administrator";

/** A person as the members list and the search show one: the name over the email. */
function PersonLines(props: { readonly name: string; readonly email: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm text-foreground">{props.name}</span>
      <span className="truncate text-xs text-muted-foreground">
        {props.email}
      </span>
    </span>
  );
}

/** The group inspector: header, access card, stale banner, tabs, and the action bar. */
export function GroupInspector(
  props: GroupInspectorProps & { readonly open?: boolean }
) {
  const { group, viewer } = props;
  const open = props.open ?? true;
  const [tab, setTab] = useState<"members" | "roles">("members");
  const [editing, setEditing] = useState<null | "label" | "local">(null);

  const [confirm, setConfirm] = useState<
    null | "archive" | "delete" | "remove"
  >(null);

  const [labelDraft, setLabelDraft] = useState(group.displayLabel ?? "");
  const [nameDraft, setNameDraft] = useState(group.name);
  const [descriptionDraft, setDescriptionDraft] = useState(group.description);
  const [roleToAssign, setRoleToAssign] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const labelId = useId();
  const nameId = useId();
  const descriptionId = useId();
  const addMembersId = useId();
  const roleAssignId = useId();

  // The sheet stays mounted, so each open starts from the group's own values.
  useEffect(() => {
    setTab("members");
    setEditing(null);
    setConfirm(null);
    setLabelDraft(group.displayLabel ?? "");
    setNameDraft(group.name);
    setDescriptionDraft(group.description);
    setRoleToAssign("");
    setMemberSearch("");
  }, [open, group.id]);

  const blocked = props.lastAdministrator;

  const selectable = props.people.filter(
    (person) => !props.members.some((member) => member.id === person.id)
  );

  // The label is what the search matches, so a name or an email finds the person.
  const memberItems = selectable.map((person) => ({
    value: person.id,
    label: `${person.name} ${person.email}`,
    person,
  }));

  // R-24c: an unlabelled directory group whose value is an id asks for a label here, not in its row.
  const asksForLabel =
    group.source === "idp" &&
    group.displayLabel === null &&
    looksLikeId(group.name) &&
    props.labelHint !== undefined;

  const roleItems = props.roles.map((role) => ({
    value: role.id,
    label: role.name,
  }));

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) props.onClose();
      }}
    >
      <SheetContent>
        {/* The kind pill sits beside the name, so no second line repeats the kind (clarify row 1). */}
        <SheetHeader>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SheetTitle className="min-w-0 wrap-anywhere">
              {groupLabel(group)}
            </SheetTitle>
            {sourcePill(group)}
            {group.lastSeenAt === null && group.source === "idp" ? (
              <StatusPill tone="neutral">Not seen yet</StatusPill>
            ) : null}
          </div>
          {group.description === "" ? null : (
            <p className="text-sm text-muted-foreground">{group.description}</p>
          )}
          {group.source === "idp" ? (
            <p className="text-xs text-muted-foreground wrap-anywhere">
              {`Value: "${group.externalId ?? ""}" · last sync ${fmtDateTime(
                group.lastSeenAt,
                viewer.timeZone,
                "never"
              )}`}
            </p>
          ) : null}
          {asksForLabel && editing !== "label" ? (
            <div>
              <Button variant="link" onClick={() => setEditing("label")}>
                {props.labelHint}
              </Button>
            </div>
          ) : null}
        </SheetHeader>
        <div className="flex min-w-0 flex-col gap-3 overflow-y-auto px-4 pb-4">
          {group.stale ? (
            <div className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
              This group no longer arrives in the sign-in token. Archive it to
              stop its grants.
            </div>
          ) : null}

          {/* Never a dead end: Open in Access when the host has the Access screen, the Roles tab
              otherwise. The count uses the Roles tab's word (clarify row 2). */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-input p-3">
            <div className="flex min-w-0 items-center gap-3">
              <ShieldIcon
                aria-hidden="true"
                className="size-5 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Access is managed in one place
                </p>
                <p className="text-xs text-muted-foreground">
                  {group.assignmentCount}{" "}
                  {group.assignmentCount === 1 ? "role" : "roles"} through this
                  group
                </p>
              </div>
            </div>
            {props.onOpenInAccess === undefined ? (
              <Button variant="link" onClick={() => setTab("roles")}>
                See roles
              </Button>
            ) : (
              <Button variant="link" onClick={props.onOpenInAccess}>
                Open in Access
              </Button>
            )}
          </div>

          <HelpDisclosure label="How group access works">
            A role assigned to this group reaches every member while the group
            is not archived. Archiving keeps the assignments and stops them
            granting.{" "}
            {group.source === "local"
              ? "A local group is managed here: you choose its members."
              : "A directory group's members come from the identity provider."}
          </HelpDisclosure>

          <Tabs
            value={tab}
            onValueChange={(value) =>
              setTab(value === "roles" ? "roles" : "members")
            }
          >
            <TabsList aria-label="Group detail">
              <TabsTrigger value="members">
                Members ({props.members.length})
              </TabsTrigger>
              <TabsTrigger value="roles">
                Roles ({props.assignments.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="members">
              {/* One search picks and adds: a pick writes at once (clarify row 4). */}
              {group.source === "local" && selectable.length > 0 ? (
                <Field className="mb-3">
                  <FieldLabel htmlFor={addMembersId}>Add members</FieldLabel>
                  <Combobox<(typeof memberItems)[number]>
                    items={memberItems}
                    value={null}
                    // Only typing fills the field, so a pick leaves it empty for the next person.
                    inputValue={memberSearch}
                    onInputValueChange={(text, details) =>
                      setMemberSearch(
                        details.reason === "input-change" ? text : ""
                      )
                    }
                    disabled={props.pending}
                    onValueChange={(item) => {
                      if (item !== null) props.onAddMembers([item.value]);
                    }}
                  >
                    <ComboboxInput
                      id={addMembersId}
                      placeholder="Search people"
                    />
                    <ComboboxContent>
                      <ComboboxEmpty>No one matches.</ComboboxEmpty>
                      <ComboboxList>
                        {(item: (typeof memberItems)[number]) => (
                          <ComboboxItem key={item.value} value={item}>
                            <PersonLines
                              name={item.person.name}
                              email={item.person.email}
                            />
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </Field>
              ) : null}

              {props.members.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No members yet.
                </p>
              ) : (
                <>
                  {/* Remove all stays while the group has members, even when every eligible
                      person is already a member and the search is hidden. */}
                  <div className="flex min-h-11 items-center justify-between gap-2">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Members · {props.members.length}
                    </span>
                    {group.source === "local" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={blocked}
                        title={blocked ? LAST_ADMIN_REASON : undefined}
                        loading={props.pending}
                        onClick={() => setConfirm("remove")}
                      >
                        Remove all
                      </Button>
                    ) : null}
                  </div>
                  <ul aria-label="Members" className="divide-y divide-input">
                    {props.members.map((member) => (
                      <li
                        key={member.id}
                        className="flex items-center gap-3 py-2"
                      >
                        <Avatar aria-hidden="true">
                          <AvatarFallback>
                            {initials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <PersonLines name={member.name} email={member.email} />
                        {group.source === "local" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={blocked}
                            title={blocked ? LAST_ADMIN_REASON : undefined}
                            loading={props.pending}
                            onClick={() => props.onRemoveMembers([member.id])}
                          >
                            Remove from group
                          </Button>
                        ) : member.syncedAt === null ? null : (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            synced{" "}
                            {fmtDateTime(member.syncedAt, viewer.timeZone, "")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </TabsContent>

            <TabsContent value="roles">
              <ul className="divide-y divide-input">
                {props.assignments.map((assignment) => (
                  <li
                    key={assignment.id}
                    className="flex items-center justify-between gap-2 py-2 text-sm text-foreground"
                  >
                    <span className="min-w-0 wrap-anywhere">
                      {assignment.roleName}
                      {assignment.scopeType === null ? null : (
                        <span className="text-muted-foreground">
                          {" "}
                          · {assignment.scopeType} {assignment.scopeId}
                        </span>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={props.pending}
                      onClick={() => props.onUnassignRole(assignment.id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>

              {/* R-24b: a pre-added directory group can be given a role before any sign-in. */}
              {props.roles.length === 0 ? null : (
                <div className="mt-3 flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Field>
                      <FieldLabel htmlFor={roleAssignId}>
                        Give this group a role
                      </FieldLabel>
                      <Select
                        items={roleItems}
                        value={roleToAssign === "" ? null : roleToAssign}
                        onValueChange={(value) => setRoleToAssign(value ?? "")}
                      >
                        <SelectTrigger id={roleAssignId}>
                          <SelectValue placeholder="Choose a role" />
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
                  </div>
                  <Button
                    disabled={roleToAssign === ""}
                    loading={props.pending}
                    onClick={() => {
                      props.onAssignRole(roleToAssign);
                      setRoleToAssign("");
                    }}
                  >
                    Assign role
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {editing === "label" ? (
            <div className="rounded-lg border border-input p-3">
              <Field>
                <FieldLabel htmlFor={labelId}>Display label</FieldLabel>
                <Input
                  id={labelId}
                  value={labelDraft}
                  onChange={(event) => setLabelDraft(event.target.value)}
                />
              </Field>
              <div className="mt-2 flex gap-2">
                <Button
                  loading={props.pending}
                  onClick={() => {
                    props.onEditLabel(
                      labelDraft.trim() === "" ? null : labelDraft
                    );
                    setEditing(null);
                  }}
                >
                  Save label
                </Button>
                <Button variant="secondary" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {editing === "local" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-input p-3">
              <Field>
                <FieldLabel htmlFor={nameId}>Name</FieldLabel>
                <Input
                  id={nameId}
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={descriptionId}>Description</FieldLabel>
                <Input
                  id={descriptionId}
                  value={descriptionDraft}
                  onChange={(event) => setDescriptionDraft(event.target.value)}
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  loading={props.pending}
                  onClick={() => {
                    props.onEditLocal(nameDraft, descriptionDraft);
                    setEditing(null);
                  }}
                >
                  Save
                </Button>
                <Button variant="secondary" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {blocked && (group.source === "idp" || group.source === "local") ? (
            <p className="text-sm text-foreground">{LAST_ADMIN_REASON}</p>
          ) : null}
        </div>

        {/* The action bar stays under the scrolling content, as the inspector captures pin it. */}
        <div className="mt-auto flex flex-wrap gap-2 border-t border-input px-4 py-3">
          {group.archived ? (
            props.onRestore === undefined ? null : (
              <Button
                variant="secondary"
                loading={props.pending}
                onClick={props.onRestore}
              >
                Restore group
              </Button>
            )
          ) : group.source === "local" ? (
            <>
              <Button variant="secondary" onClick={() => setEditing("local")}>
                <PencilIcon /> Edit name and description
              </Button>
              <Button
                variant="danger-outline"
                disabled={blocked}
                title={blocked ? LAST_ADMIN_REASON : undefined}
                loading={props.pending}
                onClick={() => setConfirm("delete")}
              >
                <TrashIcon /> Delete group
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setEditing("label")}>
                <PencilIcon /> Edit label
              </Button>
              {group.lastSeenAt === null ? (
                <Button
                  variant="danger-outline"
                  disabled={blocked}
                  title={blocked ? LAST_ADMIN_REASON : undefined}
                  loading={props.pending}
                  onClick={() => setConfirm("delete")}
                >
                  <TrashIcon /> Delete group
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  disabled={blocked}
                  title={blocked ? LAST_ADMIN_REASON : undefined}
                  loading={props.pending}
                  onClick={() => setConfirm("archive")}
                >
                  <ArchiveIcon /> Archive group
                </Button>
              )}
            </>
          )}
        </div>

        {/* Inside the sheet's content, so that one Escape closes only the confirm (PD-8). */}
        <ConfirmDialog
          open={confirm === "archive"}
          title={`Archive ${groupLabel(group)}?`}
          description={`Its ${group.assignmentCount} assignment${
            group.assignmentCount === 1 ? " stops" : "s stop"
          } granting while it is archived. The rows are kept and restore brings them back.`}
          confirmLabel="Archive group"
          danger
          onConfirm={() => {
            setConfirm(null);
            props.onArchive();
          }}
          onClose={() => setConfirm(null)}
        />

        <ConfirmDialog
          open={confirm === "delete"}
          title={`Delete ${groupLabel(group)}?`}
          description={
            group.source !== "local"
              ? "It has not been seen in a sign-in, so it can be deleted. Its assignments go with it."
              : props.members.length + group.assignmentCount === 0
                ? "It has no members and no role assignments."
                : `${props.members.length} member${
                    props.members.length === 1 ? "" : "s"
                  } and ${group.assignmentCount} role assignment${
                    group.assignmentCount === 1 ? "" : "s"
                  } go with it.`
          }
          confirmLabel="Delete group"
          danger
          onConfirm={() => {
            setConfirm(null);
            props.onDelete();
          }}
          onClose={() => setConfirm(null)}
        />

        <ConfirmDialog
          open={confirm === "remove"}
          title="Remove all members?"
          description="They leave this group. Their direct roles and other group memberships still give access; this does not remove them."
          confirmLabel="Remove all"
          danger
          onConfirm={() => {
            setConfirm(null);
            props.onRemoveAllMembers();
          }}
          onClose={() => setConfirm(null)}
        />
      </SheetContent>
    </Sheet>
  );
}

/**
 * The Groups directory (R-24, R-24b, R-24c, R-25). It reads and writes only through callbacks,
 * which the host maps onto the groups router; every destructive action confirms first, and an
 * action that would leave no administrator is disabled with the reason (R-38).
 */
export function GroupsScreen(props: GroupsScreenProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(props.initialSelectedId ?? null);

  // The inspector stays mounted while it closes, so its exit and its focus return run.
  const [inspectorOpen, setInspectorOpen] = useState(
    props.initialSelectedId !== undefined
  );

  const [dialog, setDialog] = useState<null | "directory" | "local">(null);
  const [externalId, setExternalId] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const form = useDialogSubmit();
  const searchId = useId();

  const cancel = () => {
    form.clear();
    setDialog(null);
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (needle === "") return props.groups;

    return props.groups.filter((group) =>
      `${groupLabel(group)} ${group.description} ${group.externalId ?? ""}`
        .toLowerCase()
        .includes(needle)
    );
  }, [props.groups, query]);

  const selected = props.groups.find((group) => group.id === selectedId);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <label htmlFor={searchId} className="sr-only">
            {props.searchLabel}
          </label>
          <Input
            id={searchId}
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
            placeholder={props.searchLabel}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <HelpDisclosure label="Directory and local groups" iconOnly>
            A directory group&apos;s value and members come from the identity
            provider; only its label is editable here. A group not seen yet can
            be deleted. Both kinds carry roles.
          </HelpDisclosure>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
          <label className="inline-flex min-h-11 items-center gap-2 text-sm text-foreground lg:min-h-0">
            <Checkbox
              checked={props.includeArchived}
              onCheckedChange={props.onChangeIncludeArchived}
            />
            Show archived
          </label>
          <Button
            variant="secondary"
            className="max-md:hidden"
            loading={props.pending}
            onClick={() => setDialog("directory")}
          >
            <DirectoryIcon /> Add directory group
          </Button>
          <Button
            className="max-md:hidden"
            loading={props.pending}
            onClick={() => setDialog("local")}
          >
            <PlusIcon /> New local group
          </Button>
          {/* A phone keeps the filter line one row: the secondary action moves in here. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto md:hidden"
                  aria-label="More group actions"
                />
              }
            >
              <EllipsisIcon aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDialog("directory")}>
                <DirectoryIcon /> Add directory group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {props.error === undefined ? null : (
        <p
          role="alert"
          className="mt-3 text-sm text-destructive dark:text-destructive-on-dark"
        >
          {props.error}
        </p>
      )}

      {props.loading ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading groups…
        </p>
      ) : filtered.length === 0 ? (
        <NoMatch
          copy={props.noMatch}
          onClear={() => {
            setQuery("");

            if (props.includeArchived) props.onChangeIncludeArchived(false);
          }}
        />
      ) : (
        <div className="mt-4">
          <DataTable
            label="Groups"
            rows={filtered}
            rowKey={(group) => group.id}
            rowLabel={groupLabel}
            onOpenRow={(group) => {
              setSelectedId(group.id);
              setInspectorOpen(true);
              props.onSelectGroup?.(group.id);
            }}
            columns={[
              {
                id: "group",
                header: "Group",
                cell: (group) => (
                  <span className="flex flex-col items-start">
                    <span>
                      <GroupName value={groupLabel(group)} />
                    </span>
                    <span className="text-xs font-normal text-muted-foreground wrap-anywhere">
                      {group.description}
                    </span>
                  </span>
                ),
              },
              { id: "source", header: "Source", cell: sourcePill },
              {
                id: "members",
                header: "Members",
                cell: (group) => group.memberCount,
                align: "end",
              },
              {
                id: "roles",
                header: "Roles",
                cell: (group) => group.assignmentCount,
                align: "end",
              },
            ]}
            status={(group) => syncBadge(group, props.viewer)}
            card={{
              media: (group) => (
                <IconTile>
                  {group.source === "idp" ? <DirectoryIcon /> : <LocalIcon />}
                </IconTile>
              ),
              title: (group) => <GroupName value={groupLabel(group)} />,
              badge: (group) => (
                <>
                  {sourcePill(group)}
                  {syncPill(group)}
                </>
              ),
              facts: (group) => [
                `${group.memberCount} member${group.memberCount === 1 ? "" : "s"}`,
                `${group.assignmentCount} role${group.assignmentCount === 1 ? "" : "s"}`,
                ...(group.source === "idp" && group.lastSeenAt !== null
                  ? [
                      `synced ${fmtDateTime(group.lastSeenAt, props.viewer.timeZone, "never")}`,
                    ]
                  : []),
              ],
            }}
          />
        </div>
      )}

      <StickyActionBar>
        <Button loading={props.pending} onClick={() => setDialog("local")}>
          <PlusIcon /> New local group
        </Button>
      </StickyActionBar>

      <GroupFormDialog
        open={dialog === "directory"}
        title="Add directory group"
        submitLabel="Add group"
        submitDisabled={externalId.trim() === ""}
        failure={form.failure}
        submitting={form.submitting}
        onCancel={cancel}
        onSubmit={() =>
          form.submit(
            () =>
              props.onAddDirectoryGroup?.(
                externalId.trim(),
                labelDraft.trim() === "" ? undefined : labelDraft.trim()
              ),
            () => {
              setDialog(null);
              setExternalId("");
              setLabelDraft("");
            }
          )
        }
      >
        <TextField
          label="Claim value"
          hint="The exact string the provider puts in the groups claim, for example an Entra group object ID."
          value={externalId}
          onChange={setExternalId}
        />
        <TextField
          label="Display label"
          hint="Optional. Shown in lists in place of the value."
          value={labelDraft}
          onChange={setLabelDraft}
        />
      </GroupFormDialog>

      <GroupFormDialog
        open={dialog === "local"}
        title="New local group"
        submitLabel="Create group"
        submitDisabled={name.trim() === ""}
        failure={form.failure}
        submitting={form.submitting}
        onCancel={cancel}
        onSubmit={() =>
          form.submit(
            () => props.onCreateLocalGroup?.(name.trim(), description.trim()),
            () => {
              setDialog(null);
              setName("");
              setDescription("");
            }
          )
        }
      >
        <TextField label="Name" value={name} onChange={setName} />
        <TextField
          label="Description"
          value={description}
          onChange={setDescription}
        />
      </GroupFormDialog>

      {selected === undefined ? null : (
        <GroupInspector
          open={inspectorOpen}
          pending={props.pending}
          labelHint={props.labelHint}
          group={selected}
          members={props.details?.[selected.id]?.members ?? []}
          assignments={props.details?.[selected.id]?.assignments ?? []}
          viewer={props.viewer}
          people={props.people}
          roles={props.roles ?? []}
          lastAdministrator={props.lastAdministratorGroupIds.includes(
            selected.id
          )}
          onClose={() => {
            setInspectorOpen(false);
            props.onSelectGroup?.(null);
          }}
          onArchive={() => props.onArchiveGroup?.(selected.id)}
          onRestore={
            props.onRestoreGroup === undefined
              ? undefined
              : () => props.onRestoreGroup?.(selected.id)
          }
          onDelete={() =>
            selected.source === "local"
              ? props.onDeleteLocalGroup?.(selected.id)
              : props.onDeleteGroup?.(selected.id)
          }
          onEditLabel={(label) => props.onEditLabel?.(selected.id, label)}
          onEditLocal={(nextName, nextDescription) =>
            props.onUpdateLocalGroup?.(selected.id, nextName, nextDescription)
          }
          onOpenInAccess={
            props.onOpenInAccess === undefined
              ? undefined
              : () => props.onOpenInAccess?.(selected.id)
          }
          onAssignRole={(roleId) => props.onAssignRole?.(selected.id, roleId)}
          onUnassignRole={(assignmentId) =>
            props.onUnassignRole?.(selected.id, assignmentId)
          }
          onAddMembers={(userIds) => props.onAddMembers?.(selected.id, userIds)}
          onRemoveMembers={(userIds) =>
            props.onRemoveMembers?.(selected.id, userIds)
          }
          onRemoveAllMembers={() => props.onRemoveAllMembers?.(selected.id)}
        />
      )}
    </div>
  );
}

/** One labelled text field, with an optional hint the input is described by. */
function TextField(props: {
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  const hintId = useId();

  return (
    <Field>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      <Input
        id={id}
        aria-describedby={props.hint === undefined ? undefined : hintId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.hint === undefined ? null : (
        <FieldDescription id={hintId}>{props.hint}</FieldDescription>
      )}
    </Field>
  );
}

/**
 * A dialog with a form body and a submit, for the two add forms. A refusal shows in its action
 * bar and keeps the form open (U-1).
 */
function GroupFormDialog(props: {
  readonly open: boolean;
  readonly title: string;
  readonly submitLabel: string;
  readonly submitDisabled: boolean;
  readonly failure: string | null;
  readonly submitting: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) props.onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">{props.children}</div>
        <FormActionBar failure={props.failure} placement="dialog">
          <Button variant="secondary" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button
            disabled={props.submitDisabled}
            loading={props.submitting}
            onClick={props.onSubmit}
          >
            {props.submitLabel}
          </Button>
        </FormActionBar>
      </DialogContent>
    </Dialog>
  );
}
