"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  ArchiveIcon,
  DirectoryIcon,
  LocalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
  WarningIcon,
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
} from "../admin/ui.tsx";
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
    <Pill tone="info">
      <DirectoryIcon className="mr-1 size-3" /> Directory
    </Pill>
  ) : (
    <Pill tone="neutral">
      <LocalIcon className="mr-1 size-3" /> Local
    </Pill>
  );
}

/** The state badge a directory group carries: Not seen yet, stale, or hidden when fresh. */
function syncBadge(group: Group, viewer: GroupsViewer) {
  if (group.archived) return <Pill tone="neutral">Archived</Pill>;

  if (group.source !== "idp") return null;

  if (group.lastSeenAt === null)
    return <Pill tone="neutral">Not seen yet</Pill>;

  if (group.stale) {
    return (
      <Pill tone="warning">
        <WarningIcon className="mr-1 size-3" /> Stale
      </Pill>
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
export function GroupInspector(props: GroupInspectorProps) {
  const { group, viewer } = props;
  const [tab, setTab] = useState<"members" | "roles">("members");
  const [editing, setEditing] = useState<null | "label" | "local">(null);

  const [confirm, setConfirm] = useState<
    null | "archive" | "delete" | "remove"
  >(null);

  const [labelDraft, setLabelDraft] = useState(group.displayLabel ?? "");
  const [nameDraft, setNameDraft] = useState(group.name);
  const [descriptionDraft, setDescriptionDraft] = useState(group.description);
  const [selectedMembers, setSelectedMembers] = useState<readonly string[]>([]);

  const blocked = props.lastAdministrator;

  const selectable = props.people.filter(
    (person) => !props.members.some((member) => member.id === person.id)
  );

  return (
    <SlideOver title={groupLabel(group)} onClose={props.onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {groupLabel(group)}
        </span>
        {sourcePill(group)}
        {group.lastSeenAt === null && group.source === "idp" ? (
          <Pill tone="neutral">Not seen yet</Pill>
        ) : null}
      </div>
      {group.description === "" ? null : (
        <p className="mt-1 text-sm text-muted-foreground">
          {group.description}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {group.source === "idp"
          ? `Value: ${group.externalId ?? ""} · last sync ${fmtDateTime(
              group.lastSeenAt,
              viewer.timeZone,
              "never"
            )}`
          : "Local group · membership is managed here"}
      </p>

      {group.stale ? (
        <div className="mt-3 rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
          This group no longer arrives in the sign-in token. Archive it to stop
          its grants.
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-input p-3">
        <p className="text-sm font-semibold text-foreground">
          Access is managed in one place
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {group.assignmentCount} grant{group.assignmentCount === 1 ? "" : "s"}{" "}
          reach this group today.
        </p>
        <button
          type="button"
          className={`${btnSecondary} mt-2`}
          onClick={props.onOpenInAccess}
        >
          <ShieldIcon /> Open in Access
        </button>
      </div>

      <div className="mt-3" role="tablist" aria-label="Group detail">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "members"}
          className={btnGhost}
          onClick={() => setTab("members")}
        >
          Members ({props.members.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "roles"}
          className={btnGhost}
          onClick={() => setTab("roles")}
        >
          Roles ({props.assignments.length})
        </button>
      </div>

      {tab === "members" ? (
        <div className="mt-2">
          {group.source === "local" ? (
            <>
              <ul className="divide-y divide-input">
                {props.members.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="text-sm text-foreground">
                      {member.name}{" "}
                      <span className="text-muted-foreground">
                        {member.email}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={blocked}
                      title={blocked ? LAST_ADMIN_REASON : undefined}
                      onClick={() => props.onRemoveMembers([member.id])}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {selectable.length > 0 ? (
                <div className="mt-3">
                  <label className={focusLabel}>
                    <span className="mb-1 block text-xs font-semibold text-foreground">
                      Add to group
                    </span>
                    <select
                      multiple
                      className={`${inputClass} h-28`}
                      aria-label="Add to group"
                      value={[...selectedMembers]}
                      onChange={(event) =>
                        setSelectedMembers(
                          [...event.target.selectedOptions].map(
                            (option) => option.value
                          )
                        )
                      }
                    >
                      {selectable.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name} ({person.email})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={`${btnSecondary} mt-2`}
                    disabled={selectedMembers.length === 0}
                    onClick={() => {
                      props.onAddMembers(selectedMembers);
                      setSelectedMembers([]);
                    }}
                  >
                    Add {selectedMembers.length || ""}
                  </button>
                  <button
                    type="button"
                    className={`${btnGhost} ml-2`}
                    disabled={blocked || props.members.length === 0}
                    title={blocked ? LAST_ADMIN_REASON : undefined}
                    onClick={() => setConfirm("remove")}
                  >
                    Remove all
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <ul className="divide-y divide-input">
              {props.members.map((member) => (
                <li key={member.id} className="py-2">
                  <span className="text-sm text-foreground">{member.name}</span>{" "}
                  {member.syncedAt === null ? null : (
                    <span className="text-xs text-muted-foreground">
                      synced {fmtDateTime(member.syncedAt, viewer.timeZone, "")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-input">
          {props.assignments.map((assignment) => (
            <li key={assignment.id} className="py-2 text-sm text-foreground">
              {assignment.roleName}
              {assignment.scopeType === null ? null : (
                <span className="text-muted-foreground">
                  {" "}
                  · {assignment.scopeType} {assignment.scopeId}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <HelpDisclosure label="How group access works">
        A role assigned to this group reaches every member while the group is
        not archived. Archiving keeps the assignments and stops them granting.
      </HelpDisclosure>

      {editing === "label" ? (
        <div className="mt-3 rounded-lg border border-input p-3">
          <Field label="Display label">
            <input
              className={inputClass}
              aria-label="Display label"
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                props.onEditLabel(labelDraft.trim() === "" ? null : labelDraft);
                setEditing(null);
              }}
            >
              Save label
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {editing === "local" ? (
        <div className="mt-3 rounded-lg border border-input p-3">
          <Field label="Name">
            <input
              className={inputClass}
              aria-label="Name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
            />
          </Field>
          <Field label="Description">
            <input
              className={inputClass}
              aria-label="Description"
              value={descriptionDraft}
              onChange={(event) => setDescriptionDraft(event.target.value)}
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                props.onEditLocal(nameDraft, descriptionDraft);
                setEditing(null);
              }}
            >
              Save
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {blocked && (group.source === "idp" || group.source === "local") ? (
        <p className="mt-3 text-sm text-foreground">{LAST_ADMIN_REASON}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-input pt-3">
        {group.archived ? (
          props.onRestore === undefined ? null : (
            <button
              type="button"
              className={btnSecondary}
              onClick={props.onRestore}
            >
              Restore group
            </button>
          )
        ) : group.source === "local" ? (
          <>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setEditing("local")}
            >
              <PencilIcon /> Edit name and description
            </button>
            <button
              type="button"
              className={btnDanger}
              disabled={blocked}
              title={blocked ? LAST_ADMIN_REASON : undefined}
              onClick={() => setConfirm("delete")}
            >
              <TrashIcon /> Delete group
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setEditing("label")}
            >
              <PencilIcon /> Edit label
            </button>
            {group.lastSeenAt === null ? (
              <button
                type="button"
                className={btnDanger}
                disabled={blocked}
                title={blocked ? LAST_ADMIN_REASON : undefined}
                onClick={() => setConfirm("delete")}
              >
                <TrashIcon /> Delete group
              </button>
            ) : (
              <button
                type="button"
                className={btnDanger}
                disabled={blocked}
                title={blocked ? LAST_ADMIN_REASON : undefined}
                onClick={() => setConfirm("archive")}
              >
                <ArchiveIcon /> Archive group
              </button>
            )}
          </>
        )}
      </div>

      {confirm === "archive" ? (
        <ConfirmDialog
          title={`Archive ${groupLabel(group)}?`}
          consequence={`Its ${group.assignmentCount} assignment${
            group.assignmentCount === 1 ? "" : "s"
          } stop granting while it is archived. The rows are kept and restore brings them back.`}
          confirmLabel="Archive group"
          onConfirm={() => {
            setConfirm(null);
            props.onArchive();
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}

      {confirm === "delete" ? (
        <ConfirmDialog
          title={`Delete ${groupLabel(group)}?`}
          consequence={
            group.source === "local"
              ? `${props.members.length} member${
                  props.members.length === 1 ? "" : "s"
                } and ${group.assignmentCount} role assignment${
                  group.assignmentCount === 1 ? "" : "s"
                } go with it.`
              : "It has not been seen in a sign-in, so it can be deleted. Its assignments go with it."
          }
          confirmLabel="Delete group"
          onConfirm={() => {
            setConfirm(null);
            props.onDelete();
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}

      {confirm === "remove" ? (
        <ConfirmDialog
          title="Remove all members?"
          consequence="They leave this group. Their direct roles and other group memberships still give access; this does not remove them."
          confirmLabel="Remove all"
          onConfirm={() => {
            setConfirm(null);
            props.onRemoveAllMembers();
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </SlideOver>
  );
}

const focusLabel = "block";

/**
 * The Groups directory (R-24, R-24b, R-24c, R-25). It reads and writes only through callbacks,
 * which the host maps onto the groups router; every destructive action confirms first, and an
 * action that would leave no administrator is disabled with the reason (R-38).
 */
export function GroupsScreen(props: GroupsScreenProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "directory" | "local">(null);
  const [externalId, setExternalId] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

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
        <div className="flex items-center gap-2">
          <label className="relative block">
            <span className="sr-only">Search groups</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <SearchIcon />
            </span>
            <input
              className={`${inputClass} w-72 pl-9`}
              aria-label="Search groups"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <HelpDisclosure label="Directory and local groups">
            A directory group&apos;s value and members come from the identity
            provider; only its label is editable here. A group not seen yet can
            be deleted. Both kinds carry roles.
          </HelpDisclosure>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={props.includeArchived}
              onChange={(event) =>
                props.onChangeIncludeArchived(event.target.checked)
              }
            />
            Show archived
          </label>
          <button
            type="button"
            className={btnSecondary}
            onClick={() => setDialog("directory")}
          >
            <DirectoryIcon /> Add directory group
          </button>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => setDialog("local")}
          >
            <PlusIcon /> New local group
          </button>
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
        <p className="mt-4 text-sm text-muted-foreground">
          No groups match.{" "}
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              setQuery("");

              if (props.includeArchived) props.onChangeIncludeArchived(false);
            }}
          >
            Clear filters
          </button>
        </p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-muted-foreground">
              <th className="py-2">Group</th>
              <th className="py-2">Source</th>
              <th className="py-2">Members</th>
              <th className="py-2">Roles</th>
              <th className="py-2">Last sync</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-input">
            {filtered.map((group) => (
              <tr key={group.id}>
                <td className="py-2">
                  <button
                    type="button"
                    className={`${btnGhost} h-auto flex-col items-start text-left`}
                    onClick={() => {
                      setSelectedId(group.id);
                      props.onSelectGroup?.(group.id);
                    }}
                  >
                    <span className="font-semibold text-foreground">
                      {groupLabel(group)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {group.description}
                    </span>
                  </button>
                </td>
                <td className="py-2">{sourcePill(group)}</td>
                <td className="py-2 text-foreground">{group.memberCount}</td>
                <td className="py-2 text-foreground">
                  {group.assignmentCount}
                </td>
                <td className="py-2">{syncBadge(group, props.viewer)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dialog === "directory" ? (
        <ConfirmDialogShell
          title="Add directory group"
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
          submitLabel="Add group"
          submitDisabled={externalId.trim() === ""}
        >
          <Field
            label="Claim value"
            hint="The exact string the provider puts in the groups claim, for example an Entra group object ID."
          >
            <input
              className={inputClass}
              aria-label="Claim value"
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
            />
          </Field>
          <Field
            label="Display label"
            hint="Optional. Shown in lists in place of the value."
          >
            <input
              className={inputClass}
              aria-label="Display label"
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
            />
          </Field>
        </ConfirmDialogShell>
      ) : null}

      {dialog === "local" ? (
        <ConfirmDialogShell
          title="New local group"
          onCancel={() => setDialog(null)}
          onSubmit={() => {
            props.onCreateLocalGroup?.(name.trim(), description.trim());
            setDialog(null);
            setName("");
            setDescription("");
          }}
          submitLabel="Create group"
          submitDisabled={name.trim() === ""}
        >
          <Field label="Name">
            <input
              className={inputClass}
              aria-label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Description">
            <input
              className={inputClass}
              aria-label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </ConfirmDialogShell>
      ) : null}

      {selected === undefined ? null : (
        <GroupInspector
          group={selected}
          members={props.details?.[selected.id]?.members ?? []}
          assignments={props.details?.[selected.id]?.assignments ?? []}
          viewer={props.viewer}
          people={props.people}
          lastAdministrator={props.lastAdministratorGroupIds.includes(
            selected.id
          )}
          onClose={() => {
            setSelectedId(null);
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
          onOpenInAccess={() => props.onOpenInAccess?.(selected.id)}
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

/** A dialog with a form body and a submit; `ConfirmDialog`'s sibling for the two add forms. */
function ConfirmDialogShell(props: {
  readonly title: string;
  readonly submitLabel: string;
  readonly submitDisabled?: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-card"
      >
        <h2 className="text-lg font-semibold text-foreground">{props.title}</h2>
        <div className="mt-3 space-y-3">{props.children}</div>
        <div className="mt-5 flex justify-end gap-2">
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
            disabled={props.submitDisabled ?? false}
            onClick={props.onSubmit}
          >
            {props.submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
