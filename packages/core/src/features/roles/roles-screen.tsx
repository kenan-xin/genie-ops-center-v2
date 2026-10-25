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
  Field,
  FieldLabel,
  HelpDisclosure,
  Input,
  LabelPill,
  StatusPill,
} from "@genie/ui";
import { useId, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  CopyIcon,
  PencilIcon,
  PlusIcon,
  ShieldIcon,
  TrashIcon,
  WarningIcon,
} from "../admin/icons.tsx";
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
 * role is never edited in place (R-33). The dialog stays mounted; its body mounts on each open, so
 * the fields start from the form state every time.
 */
function RoleFormDialog(props: {
  readonly open: boolean;
  readonly state: FormState;
  /** The declared catalogue the picker offers, grouped by module (R-33). */
  readonly catalogue: readonly RolePermissionGroup[];
  /** Stored keys outside the catalogue, shown as a removable set (R-33b). */
  readonly unavailableKeys: readonly UnavailableKey[];
  readonly onCancel: () => void;
  readonly onSubmit: (input: RoleInput) => void;
}) {
  const title =
    props.state.mode === "edit"
      ? "Edit role"
      : props.state.mode === "copy"
        ? "New role from copy"
        : "New role";

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) props.onCancel();
      }}
    >
      {/* A copy keeps its dialog name "Copy role"; the heading reads "New role from copy". */}
      <DialogContent
        {...(props.state.mode === "copy"
          ? { "aria-label": "Copy role", "aria-labelledby": undefined }
          : {})}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <RoleFormBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function RoleFormBody(props: {
  readonly state: FormState;
  readonly catalogue: readonly RolePermissionGroup[];
  readonly unavailableKeys: readonly UnavailableKey[];
  readonly onCancel: () => void;
  readonly onSubmit: (input: RoleInput) => void;
}) {
  const nameId = useId();
  const descriptionId = useId();
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
    <>
      <div className="space-y-3">
        <Field>
          <FieldLabel htmlFor={nameId}>Name</FieldLabel>
          <Input
            id={nameId}
            aria-label="Role name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={descriptionId}>Description</FieldLabel>
          <Input
            id={descriptionId}
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeUnavailable(entry.key)}
                >
                  Remove
                </Button>
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
              <StatusPill tone={group.entitled ? "success" : "neutral"}>
                {group.entitled ? "Entitled" : "Not entitled"}
              </StatusPill>
            </legend>
            {group.keys.map((entry) => (
              <label
                key={entry.key}
                className="flex min-h-11 items-center gap-2 text-sm text-foreground"
              >
                <Checkbox
                  checked={picked.includes(entry.key)}
                  onCheckedChange={() => toggle(entry.key)}
                />
                {entry.label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <DialogFooter>
        <Button variant="secondary" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
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
        </Button>
      </DialogFooter>
    </>
  );
}

function kindPill(role: Role) {
  return role.kind === "system" ? (
    <LabelPill>
      System{role.moduleId === null ? "" : ` · ${role.moduleId}`}
    </LabelPill>
  ) : (
    <LabelPill>Custom</LabelPill>
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
      <Button variant="ghost" size="sm" onClick={props.onBack}>
        ← Roles
      </Button>
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
          <Button variant="secondary" onClick={props.onCopy}>
            <CopyIcon /> Copy role
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={props.onEdit}>
              <PencilIcon /> Edit role
            </Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <TrashIcon /> Delete role
            </Button>
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
            <StatusPill tone={group.entitled ? "success" : "neutral"}>
              {group.entitled ? "Entitled" : "Not entitled"}
            </StatusPill>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => props.onRemoveUnavailable(entry.key)}
                      >
                        Remove
                      </Button>
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
      <div className="mt-2">
        <Button variant="secondary" onClick={props.onOpenInAccess}>
          <ShieldIcon /> Manage in Access
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${detail.name}?`}
        description={`Its ${detail.assignmentCount} assignment${
          detail.assignmentCount === 1 ? "" : "s"
        } go with it.`}
        confirmLabel="Delete role"
        danger
        onConfirm={() => {
          setConfirmDelete(false);
          props.onDelete();
        }}
        onClose={() => setConfirmDelete(false)}
      />
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

  // The form keeps its last state while closed, so its title does not blank during the exit.
  const [form, setForm] = useState<FormState>({
    mode: "create",
    name: "",
    description: "",
    permissions: [],
  });

  const [formOpen, setFormOpen] = useState(false);
  const searchId = useId();

  const openForm = (next: FormState) => {
    setForm(next);
    setFormOpen(true);
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (needle === "") return props.roles;

    return props.roles.filter((role) =>
      `${role.name} ${role.description}`.toLowerCase().includes(needle)
    );
  }, [props.roles, query]);

  const formDialog = (
    <RoleFormDialog
      open={formOpen}
      state={form}
      catalogue={props.catalogue}
      unavailableKeys={
        props.selectedRoleId === null
          ? []
          : (props.detail?.unavailableKeys ?? [])
      }
      onCancel={() => setFormOpen(false)}
      onSubmit={(input) => {
        setFormOpen(false);

        // An edit updates the selected role by id; a create or a copy makes a new row.
        if (form.mode === "edit" && form.roleId !== undefined) {
          props.onUpdateRole?.(form.roleId, input);
        } else {
          props.onCreateRole?.(input);
        }
      }}
    />
  );

  if (props.selectedRoleId !== null) {
    if (props.detail === undefined) {
      return (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => props.onSelectRole(null)}
          >
            ← Roles
          </Button>
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Loading role…
          </p>
          {formDialog}
        </div>
      );
    }

    return (
      <div>
        <RoleDetailView
          detail={props.detail}
          onBack={() => props.onSelectRole(null)}
          onEdit={() =>
            openForm({
              mode: "edit",
              roleId: props.detail!.id,
              name: props.detail!.name,
              description: props.detail!.description,
              permissions: props.detail!.permissions,
            })
          }
          onCopy={() =>
            openForm({
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
        {formDialog}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={searchId} className="sr-only">
            Search roles
          </label>
          <Input
            id={searchId}
            className="w-72 max-w-full"
            aria-label="Search roles"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <HelpDisclosure label="How roles work">
            A system role is read-only and copyable. A custom role is editable.
            Access gives a role to a person or a group.
          </HelpDisclosure>
        </div>
        <Button
          onClick={() =>
            openForm({
              mode: "create",
              name: "",
              description: "",
              permissions: [],
            })
          }
        >
          <PlusIcon /> New role
        </Button>
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
        <div className="mt-4">
          <DataTable
            label="Roles"
            rows={filtered}
            rowKey={(role) => role.id}
            rowLabel={(role) => role.name}
            onOpenRow={(role) => props.onSelectRole(role.id)}
            columns={[
              {
                id: "role",
                header: "Role",
                cell: (role) => (
                  <span className="flex flex-col items-start">
                    <span>{role.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {role.description}
                    </span>
                  </span>
                ),
              },
              { id: "kind", header: "Kind", cell: kindPill },
              {
                id: "permissions",
                header: "Permissions",
                cell: (role) => role.permissions.length,
              },
              {
                id: "assignments",
                header: "Assignments",
                cell: (role) => role.assignmentCount,
              },
            ]}
            facts={(role) => [
              kindPill(role),
              `${role.permissions.length} permissions · ${role.assignmentCount} assignments`,
            ]}
          />
        </div>
      )}

      {formDialog}
    </div>
  );
}

/** The list-body wrapper the detail view's permission picker needs; kept for future reuse. */
export function RolePermissionList(props: { readonly children: ReactNode }) {
  return <div className="mt-2 space-y-2">{props.children}</div>;
}
