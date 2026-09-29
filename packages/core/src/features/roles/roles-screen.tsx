"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  CopyIcon,
  PencilIcon,
  PlusIcon,
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
} from "../admin/ui.tsx";
import type {
  Role,
  RoleDetail,
  RoleInput,
  RolePermissionGroup,
  RolesScreenProps,
  UnavailableKey,
} from "./types.ts";

/** The human reason a stored key no longer grants, shown beside it in the form and the detail. */
function unavailableReasonLabel(reason: UnavailableKey["reason"]): string {
  return reason === "module-disabled"
    ? "the module is switched off"
    : "the key is retired";
}

type FormState = {
  readonly mode: "create" | "edit" | "copy";
  readonly roleId?: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
};

/**
 * The role form: name, description, and a permission picker grouped by module with a checkbox per
 * key and a select-all per module. It is used for New role, Edit and Copy (prefilled), so a system
 * role is never edited in place (R-33).
 */
function RoleFormDialog(props: {
  readonly state: FormState;
  /** The declared catalogue the picker offers, grouped by module (R-33). */
  readonly catalogue: readonly RolePermissionGroup[];
  /** Stored keys outside the catalogue, shown as a removable set (R-33b). */
  readonly unavailableKeys: readonly UnavailableKey[];
  readonly onCancel: () => void;
  readonly onSubmit: (input: RoleInput) => void;
}) {
  const [name, setName] = useState(props.state.name);
  const [description, setDescription] = useState(props.state.description);

  const [picked, setPicked] = useState<readonly string[]>(
    props.state.permissions
  );

  const [unavailable, setUnavailable] = useState<readonly UnavailableKey[]>(
    props.unavailableKeys
  );

  const toggle = (key: string) =>
    setPicked((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key]
    );

  const removeUnavailable = (key: string) => {
    setUnavailable((current) => current.filter((entry) => entry.key !== key));
    setPicked((current) => current.filter((entry) => entry !== key));
  };

  const canSubmit = name.trim() !== "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          props.state.mode === "edit"
            ? "Edit role"
            : props.state.mode === "copy"
              ? "Copy role"
              : "New role"
        }
        className="max-h-screen w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-card"
      >
        <h2 className="text-lg font-semibold text-foreground">
          {props.state.mode === "edit"
            ? "Edit role"
            : props.state.mode === "copy"
              ? "New role from copy"
              : "New role"}
        </h2>

        <div className="mt-3 space-y-3">
          <Field label="Name">
            <input
              className={inputClass}
              aria-label="Role name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Description">
            <input
              className={inputClass}
              aria-label="Role description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          {unavailable.length > 0 ? (
            <fieldset className="rounded-lg border border-border p-3">
              <legend className="text-sm font-semibold text-foreground">
                Unavailable keys
              </legend>
              {unavailable.map((entry) => (
                <div key={entry.key} className="flex items-center gap-2">
                  <WarningIcon className="size-4 text-destructive" />
                  <code className="text-xs text-foreground">{entry.key}</code>
                  <span className="text-xs text-muted-foreground">
                    {unavailableReasonLabel(entry.reason)}
                  </span>
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => removeUnavailable(entry.key)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </fieldset>
          ) : null}

          {props.catalogue.map((group) => (
            <fieldset
              key={group.moduleId}
              className="rounded-lg border border-input p-3"
            >
              <legend className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {group.moduleName}
                <Pill tone={group.entitled ? "success" : "neutral"}>
                  {group.entitled ? "Entitled" : "Not entitled"}
                </Pill>
              </legend>
              {group.keys.map((entry) => (
                <label
                  key={entry.key}
                  className="mt-1 flex items-center gap-2 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={picked.includes(entry.key)}
                    onChange={() => toggle(entry.key)}
                  />
                  {entry.label}
                </label>
              ))}
            </fieldset>
          ))}
        </div>

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
            disabled={!canSubmit}
            onClick={() =>
              props.onSubmit({
                name: name.trim(),
                description: description.trim(),
                permissions: picked,
              })
            }
          >
            {props.state.mode === "edit" ? "Save role" : "Create role"}
          </button>
        </div>
      </div>
    </div>
  );
}

function kindPill(role: Role) {
  return role.kind === "system" ? (
    <Pill tone="neutral">
      System{role.moduleId === null ? "" : ` · ${role.moduleId}`}
    </Pill>
  ) : (
    <Pill tone="info">Custom</Pill>
  );
}

/** The role detail: header actions, permission groups with the entitlement state, and holders. */
function RoleDetailView(props: {
  readonly detail: RoleDetail;
  readonly onBack: () => void;
  readonly onEdit: () => void;
  readonly onCopy: () => void;
  readonly onDelete: () => void;
  readonly onOpenInAccess: () => void;
  readonly onRemoveUnavailable: (key: string) => void;
}) {
  const { detail } = props;
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div>
      <button type="button" className={btnGhost} onClick={props.onBack}>
        ← Roles
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold text-foreground">{detail.name}</h2>
        {kindPill(detail)}
      </div>
      {detail.description === "" ? null : (
        <p className="mt-1 text-sm text-muted-foreground">
          {detail.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {detail.kind === "system" ? (
          <button type="button" className={btnSecondary} onClick={props.onCopy}>
            <CopyIcon /> Copy role
          </button>
        ) : (
          <>
            <button
              type="button"
              className={btnSecondary}
              onClick={props.onEdit}
            >
              <PencilIcon /> Edit role
            </button>
            <button
              type="button"
              className={btnDanger}
              onClick={() => setConfirmDelete(true)}
            >
              <TrashIcon /> Delete role
            </button>
          </>
        )}
      </div>

      <h3 className="mt-4 text-sm font-semibold text-foreground">
        Permissions
      </h3>
      {detail.permissionGroups.map((group) => (
        <section
          key={group.moduleId}
          className="mt-2 rounded-lg border border-input p-3"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {group.moduleName}
            </span>
            <Pill tone={group.entitled ? "success" : "neutral"}>
              {group.entitled ? "Entitled" : "Not entitled"}
            </Pill>
          </div>
          <ul className="mt-1">
            {group.keys.map((entry) => (
              <li
                key={entry.key}
                className="flex items-center gap-2 py-0.5 text-sm text-foreground"
              >
                <code className="text-xs">{entry.key}</code>
                {entry.unavailable ? (
                  <>
                    <WarningIcon className="size-4 text-destructive" />
                    <span className="text-xs text-destructive">
                      Unavailable,{" "}
                      {unavailableReasonLabel(
                        entry.unavailableReason ?? "retired"
                      )}
                    </span>
                    {detail.kind === "custom" ? (
                      <button
                        type="button"
                        className={btnGhost}
                        onClick={() => props.onRemoveUnavailable(entry.key)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </>
                ) : null}
                {detail.entitlementAdded.includes(entry.key) ? (
                  <span className="text-xs text-muted-foreground">
                    Added by entitlement
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <h3 className="mt-4 text-sm font-semibold text-foreground">
        Who holds this role
      </h3>
      <p className="text-sm text-muted-foreground">
        A role held through a group changes for every member of that group.
      </p>
      <ul className="mt-1 divide-y divide-input">
        {detail.assignments.map((assignment) => (
          <li key={assignment.id} className="py-2 text-sm text-foreground">
            {assignment.principalLabel}
            <span className="text-muted-foreground">
              {" "}
              ·{" "}
              {assignment.scopeType === null
                ? "Whole tenant"
                : assignment.scopeId}
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={`${btnSecondary} mt-2`}
        onClick={props.onOpenInAccess}
      >
        <ShieldIcon /> Manage in Access
      </button>

      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete ${detail.name}?`}
          consequence={`Its ${detail.assignmentCount} assignment${
            detail.assignmentCount === 1 ? "" : "s"
          } go with it.`}
          confirmLabel="Delete role"
          onConfirm={() => {
            setConfirmDelete(false);
            props.onDelete();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * The Roles directory and detail (R-33, R-33b). A system role is read-only and copyable; a custom
 * role is editable and deletable. The detail shows each module's entitlement state and warns on a
 * key that no longer exists, offering its removal from a custom role without touching the role,
 * its assignments or its group memberships.
 */
export function RolesScreen(props: RolesScreenProps) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<FormState | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (needle === "") return props.roles;

    return props.roles.filter((role) =>
      `${role.name} ${role.description}`.toLowerCase().includes(needle)
    );
  }, [props.roles, query]);

  if (props.selectedRoleId !== null) {
    if (props.detail === undefined) {
      return (
        <div>
          <button
            type="button"
            className={btnGhost}
            onClick={() => props.onSelectRole(null)}
          >
            ← Roles
          </button>
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Loading role…
          </p>
        </div>
      );
    }

    return (
      <div>
        <RoleDetailView
          detail={props.detail}
          onBack={() => props.onSelectRole(null)}
          onEdit={() =>
            setForm({
              mode: "edit",
              roleId: props.detail!.id,
              name: props.detail!.name,
              description: props.detail!.description,
              permissions: props.detail!.permissions,
            })
          }
          onCopy={() =>
            setForm({
              mode: "copy",
              name: `${props.detail!.name} copy`,
              description: props.detail!.description,
              permissions: props.detail!.permissions,
            })
          }
          onDelete={() => props.onDeleteRole?.(props.detail!.id)}
          onOpenInAccess={() => props.onOpenInAccess?.(props.detail!.id)}
          onRemoveUnavailable={(key) =>
            props.onUpdateRole?.(props.detail!.id, {
              name: props.detail!.name,
              description: props.detail!.description,
              permissions: props.detail!.permissions.filter(
                (entry) => entry !== key
              ),
            })
          }
        />

        {form === null ? null : (
          <RoleFormDialog
            state={form}
            catalogue={props.catalogue}
            unavailableKeys={props.detail?.unavailableKeys ?? []}
            onCancel={() => setForm(null)}
            onSubmit={(input) => {
              setForm(null);

              // An edit updates the selected role by id; a create or a copy makes a new row.
              if (form.mode === "edit" && form.roleId !== undefined) {
                props.onUpdateRole?.(form.roleId, input);
              } else {
                props.onCreateRole?.(input);
              }
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="relative block">
            <span className="sr-only">Search roles</span>
            <input
              className={`${inputClass} w-72`}
              aria-label="Search roles"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <HelpDisclosure label="How roles work">
            A system role is read-only and copyable. A custom role is editable.
            Access gives a role to a person or a group.
          </HelpDisclosure>
        </div>
        <button
          type="button"
          className={btnPrimary}
          onClick={() =>
            setForm({
              mode: "create",
              name: "",
              description: "",
              permissions: [],
            })
          }
        >
          <PlusIcon /> New role
        </button>
      </div>

      {props.error === undefined ? null : (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {props.error}
        </p>
      )}

      {props.loading ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading roles…
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No roles match.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-muted-foreground">
              <th className="py-2">Role</th>
              <th className="py-2">Kind</th>
              <th className="py-2">Permissions</th>
              <th className="py-2">Assignments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-input">
            {filtered.map((role) => (
              <tr key={role.id}>
                <td className="py-2">
                  <button
                    type="button"
                    className={`${btnGhost} h-auto flex-col items-start text-left`}
                    onClick={() => props.onSelectRole(role.id)}
                  >
                    <span className="font-semibold text-foreground">
                      {role.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {role.description}
                    </span>
                  </button>
                </td>
                <td className="py-2">{kindPill(role)}</td>
                <td className="py-2 text-foreground">
                  {role.permissions.length}
                </td>
                <td className="py-2 text-foreground">{role.assignmentCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {form === null ? null : (
        <RoleFormDialog
          state={form}
          catalogue={props.catalogue}
          unavailableKeys={[]}
          onCancel={() => setForm(null)}
          onSubmit={(input) => {
            setForm(null);
            props.onCreateRole?.(input);
          }}
        />
      )}
    </div>
  );
}

/** The list-body wrapper the detail view's permission picker needs; kept for future reuse. */
export function RolePermissionList(props: { readonly children: ReactNode }) {
  return <div className="mt-2 space-y-2">{props.children}</div>;
}
