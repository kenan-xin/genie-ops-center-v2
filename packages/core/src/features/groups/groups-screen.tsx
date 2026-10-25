"use client";

import {
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  FieldDescription,
  FieldLabel,
  HelpDisclosure,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@genie/ui";
import { useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";

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

/** The state badge a directory group carries: Not seen yet, stale, or hidden when fresh. */
function syncBadge(group: Group, viewer: GroupsViewer) {
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

  return (
    <span className="text-xs text-muted-foreground">
      Synced {fmtDateTime(group.lastSeenAt, viewer.timeZone, "never")}
    </span>
  );
}

const LAST_ADMIN_REASON = "This would leave no active tenant administrator";

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
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [roleToAssign, setRoleToAssign] = useState("");
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
    setSelectedMembers([]);
    setRoleToAssign("");
  }, [open, group.id]);

  const blocked = props.lastAdministrator;

  const selectable = props.people.filter(
    (person) => !props.members.some((member) => member.id === person.id)
  );

  const memberItems = selectable.map((person) => ({
    value: person.id,
    label: `${person.name} (${person.email})`,
  }));

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
        <SheetHeader>
          <SheetTitle>{groupLabel(group)}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {sourcePill(group)}
              {group.lastSeenAt === null && group.source === "idp" ? (
                <StatusPill tone="neutral">Not seen yet</StatusPill>
              ) : null}
            </div>
            {group.description === "" ? null : (
              <p className="mt-1 text-sm text-muted-foreground">
                {group.description}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground wrap-anywhere">
              {group.source === "idp"
                ? `Value: "${group.externalId ?? ""}" · last sync ${fmtDateTime(
                    group.lastSeenAt,
                    viewer.timeZone,
                    "never"
                  )}`
                : "Local group · membership is managed here"}
            </p>
          </div>

          {group.stale ? (
            <div className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
              This group no longer arrives in the sign-in token. Archive it to
              stop its grants.
            </div>
          ) : null}

          <div className="rounded-xl border border-input p-3">
            <p className="text-sm font-semibold text-foreground">
              Access is managed in one place
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {group.assignmentCount} grant
              {group.assignmentCount === 1 ? "" : "s"} reach this group today.
            </p>
            {props.onOpenInAccess === undefined ? null : (
              <div className="mt-2">
                <Button variant="secondary" onClick={props.onOpenInAccess}>
                  <ShieldIcon /> Open in Access
                </Button>
              </div>
            )}
          </div>

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
              {group.source === "local" ? (
                <>
                  <ul className="divide-y divide-input">
                    {props.members.map((member) => (
                      <li
                        key={member.id}
                        className="flex items-center justify-between gap-2 py-2"
                      >
                        <span className="min-w-0 text-sm text-foreground wrap-anywhere">
                          {member.name}{" "}
                          <span className="text-muted-foreground">
                            {member.email}
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={blocked}
                          title={blocked ? LAST_ADMIN_REASON : undefined}
                          loading={props.pending}
                          onClick={() => props.onRemoveMembers([member.id])}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {selectable.length > 0 ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <Field>
                        <FieldLabel htmlFor={addMembersId}>
                          Add to group
                        </FieldLabel>
                        <Select
                          multiple
                          items={memberItems}
                          value={selectedMembers}
                          onValueChange={setSelectedMembers}
                        >
                          <SelectTrigger id={addMembersId}>
                            <SelectValue placeholder="Choose people" />
                          </SelectTrigger>
                          <SelectContent>
                            {memberItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <div>
                        <Button
                          variant="secondary"
                          disabled={selectedMembers.length === 0}
                          loading={props.pending}
                          onClick={() => {
                            props.onAddMembers(selectedMembers);
                            setSelectedMembers([]);
                          }}
                        >
                          Add {selectedMembers.length || ""}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {/* Remove all stays visible while the group has members, even when every
                      eligible person is already a member and the picker is hidden. */}
                  {props.members.length === 0 ? null : (
                    <div className="mt-3">
                      <Button
                        variant="ghost"
                        disabled={blocked}
                        title={blocked ? LAST_ADMIN_REASON : undefined}
                        loading={props.pending}
                        onClick={() => setConfirm("remove")}
                      >
                        Remove all
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <ul className="divide-y divide-input">
                  {props.members.map((member) => (
                    <li key={member.id} className="py-2">
                      <span className="text-sm text-foreground">
                        {member.name}
                      </span>{" "}
                      {member.syncedAt === null ? null : (
                        <span className="text-xs text-muted-foreground">
                          synced{" "}
                          {fmtDateTime(member.syncedAt, viewer.timeZone, "")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
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
                        <SelectTrigger
                          id={roleAssignId}
                          aria-label="Role to assign"
                        >
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

          <HelpDisclosure label="How group access works">
            A role assigned to this group reaches every member while the group
            is not archived. Archiving keeps the assignments and stops them
            granting.
          </HelpDisclosure>

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

          <div className="flex flex-wrap gap-2 border-t border-input pt-3">
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
                  variant="danger"
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
                    variant="danger"
                    disabled={blocked}
                    title={blocked ? LAST_ADMIN_REASON : undefined}
                    loading={props.pending}
                    onClick={() => setConfirm("delete")}
                  >
                    <TrashIcon /> Delete group
                  </Button>
                ) : (
                  <Button
                    variant="danger"
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
        </div>

        {/* Inside the sheet's content, so that one Escape closes only the confirm (PD-8). */}
        <ConfirmDialog
          open={confirm === "archive"}
          title={`Archive ${groupLabel(group)}?`}
          description={`Its ${group.assignmentCount} assignment${
            group.assignmentCount === 1 ? "" : "s"
          } stop granting while it is archived. The rows are kept and restore brings them back.`}
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
            group.source === "local"
              ? `${props.members.length} member${
                  props.members.length === 1 ? "" : "s"
                } and ${group.assignmentCount} role assignment${
                  group.assignmentCount === 1 ? "" : "s"
                } go with it.`
              : "It has not been seen in a sign-in, so it can be deleted. Its assignments go with it."
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The inspector stays mounted while it closes, so its exit and its focus return run.
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [dialog, setDialog] = useState<null | "directory" | "local">(null);
  const [externalId, setExternalId] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const searchId = useId();

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
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <label htmlFor={searchId} className="sr-only">
            Search groups
          </label>
          <Input
            id={searchId}
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <HelpDisclosure label="Directory and local groups">
            A directory group&apos;s value and members come from the identity
            provider; only its label is editable here. A group not seen yet can
            be deleted. Both kinds carry roles.
          </HelpDisclosure>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-11 items-center gap-2 text-sm text-foreground lg:min-h-0">
            <Checkbox
              checked={props.includeArchived}
              onCheckedChange={props.onChangeIncludeArchived}
            />
            Show archived
          </label>
          {/* The add dialogs close on submit, so their opener shows the running write. */}
          <Button
            variant="secondary"
            loading={props.pending}
            onClick={() => setDialog("directory")}
          >
            <DirectoryIcon /> Add directory group
          </Button>
          <Button loading={props.pending} onClick={() => setDialog("local")}>
            <PlusIcon /> New local group
          </Button>
        </div>
      </div>

      {props.error === undefined ? null : (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {props.error}
        </p>
      )}

      {props.loading ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading groups…
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No groups match"
          description="Clear the search and the archived filter to see every group."
          action={
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setQuery("");

                if (props.includeArchived) props.onChangeIncludeArchived(false);
              }}
            >
              Clear filters
            </Button>
          }
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
                    <span>{groupLabel(group)}</span>
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
              },
              {
                id: "roles",
                header: "Roles",
                cell: (group) => group.assignmentCount,
              },
            ]}
            status={(group) => syncBadge(group, props.viewer)}
            facts={(group) => [
              sourcePill(group),
              `${group.memberCount} members · ${group.assignmentCount} roles`,
            ]}
          />
        </div>
      )}

      <GroupFormDialog
        open={dialog === "directory"}
        title="Add directory group"
        submitLabel="Add group"
        submitDisabled={externalId.trim() === ""}
        onCancel={() => setDialog(null)}
        onSubmit={() => {
          props.onAddDirectoryGroup?.(
            externalId.trim(),
            labelDraft.trim() === "" ? undefined : labelDraft.trim()
          );
          setDialog(null);
          setExternalId("");
          setLabelDraft("");
        }}
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
        onCancel={() => setDialog(null)}
        onSubmit={() => {
          props.onCreateLocalGroup?.(name.trim(), description.trim());
          setDialog(null);
          setName("");
          setDescription("");
        }}
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

/** A dialog with a form body and a submit, for the two add forms. */
function GroupFormDialog(props: {
  readonly open: boolean;
  readonly title: string;
  readonly submitLabel: string;
  readonly submitDisabled: boolean;
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
        <DialogFooter>
          <Button variant="secondary" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button disabled={props.submitDisabled} onClick={props.onSubmit}>
            {props.submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
