"use client";

import {
  Avatar,
  AvatarFallback,
  Button,
  Checkbox,
  ConfirmDialog,
  CountPill,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  FieldError,
  FieldLabel,
  FormActionBar,
  HelpDisclosure,
  IconTile,
  iconLead,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  LabelPill,
  StatusPill,
  StickyActionBar,
  Switch,
  Textarea,
  focusRing,
  minTouchHeight,
} from "@genie/ui";
import { ArrowRightIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { TENANT_ADMINISTRATOR_ROLE } from "../../lib/module-contract/system-roles.ts";
import { accessHref } from "../access/access-link.ts";
import { assignedLabel, holderLine } from "../access/assignment-words.ts";
import { overviewRows, pausedLabel } from "../access/overview-view.ts";
import { useDialogSubmit } from "../admin/dialog-submit.ts";
import {
  CopyIcon,
  DirectoryIcon,
  LocalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  KeyIcon,
  TrashIcon,
  WarningIcon,
} from "../admin/icons.tsx";
import { NoMatch } from "../admin/no-match.tsx";
import { initials } from "../audit/helpers.ts";
import { PageLink } from "../shell/page-link.tsx";
import { permissionCountLine } from "./role-words.ts";
import type {
  Role,
  RoleDetail,
  RoleHolders,
  RoleInput,
  RolePermissionGroup,
  RolesScreenProps,
  UnavailableKey,
} from "./types.ts";

/** The human reason a stored key no longer grants, shown beside it in the form and the detail. */
function unavailableReasonLabel(reason: UnavailableKey["reason"]): string {
  return reason === "module-disabled"
    ? "the module is off"
    : "this permission no longer exists";
}

type FormState = {
  readonly mode: "create" | "edit" | "copy";
  readonly roleId?: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
  /** A row menu's Copy or Edit: the row's stored keys outside the catalogue, removable (R-33b). */
  readonly unavailableKeys?: readonly UnavailableKey[];
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
  readonly failure: string | null;
  readonly submitting: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (input: RoleInput) => void;
}) {
  const title =
    props.state.mode === "edit"
      ? "Edit role"
      : props.state.mode === "copy"
        ? "Copy as new role"
        : "New role";

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) props.onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            A role is a named set of permission keys. Assign it to groups or
            people afterwards.
          </DialogDescription>
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
  readonly failure: string | null;
  readonly submitting: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (input: RoleInput) => void;
}) {
  const nameId = useId();
  const descriptionId = useId();
  const nameErrorId = useId();
  const [name, setName] = useState(props.state.name);
  const [description, setDescription] = useState(props.state.description);
  const [nameError, setNameError] = useState(false);

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
            placeholder="For example, Claims supervisor"
            value={name}
            aria-invalid={nameError || undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(false);
            }}
          />
          {nameError ? (
            <FieldError id={nameErrorId}>Enter a name.</FieldError>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor={descriptionId}>Description</FieldLabel>
          <Textarea
            id={descriptionId}
            aria-label="Role description"
            placeholder="What this role is for"
            rows={2}
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
              <div key={entry.key} className="flex items-start gap-2">
                <WarningIcon className="size-4 text-destructive dark:text-destructive-on-dark" />
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

        <p className="text-xs font-semibold text-foreground">
          Permissions{" "}
          <span className="font-normal text-muted-foreground">
            ({picked.length} selected)
          </span>
        </p>
        {/* G48: the list scrolls in a bounded box, so the dialog and its buttons fit the screen. */}
        <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
          {props.catalogue.map((group) => {
            const keys = group.keys.map((entry) => entry.key);
            const all = keys.every((key) => picked.includes(key));

            return (
              <fieldset key={group.moduleId} className="relative">
                {/* The mockup: one band per module with its state and Select all on the same line.
                  The button sits on the band but outside the legend, so the group's name stays short. */}
                <legend className="float-left flex min-h-9 w-full items-center gap-2 bg-muted px-3 text-sm font-semibold text-foreground">
                  {group.moduleName}
                  <StatusPill tone={group.entitled ? "success" : "neutral"}>
                    {group.entitled ? "Module on" : "Module off"}
                  </StatusPill>
                </legend>
                <Button
                  className="absolute top-0 right-3"
                  variant="link"
                  size="sm"
                  onClick={() =>
                    setPicked((current) =>
                      all
                        ? current.filter((key) => !keys.includes(key))
                        : [...new Set([...current, ...keys])]
                    )
                  }
                >
                  {all ? "Deselect all" : "Select all"}
                  <span className="sr-only"> {group.moduleName}</span>
                </Button>
                {group.keys.map((entry) => (
                  <label
                    key={entry.key}
                    className={`clear-left flex ${minTouchHeight} items-center gap-2 px-3 text-sm text-foreground`}
                  >
                    <Checkbox
                      checked={picked.includes(entry.key)}
                      onCheckedChange={() => toggle(entry.key)}
                    />
                    <span className="min-w-0 flex-1">{entry.label}</span>
                    {/* The checkbox keeps the label as its name; the key is a visual hint. */}
                    {entry.label === entry.key ? null : (
                      <code
                        aria-hidden="true"
                        className="text-xs text-muted-foreground"
                      >
                        {entry.key}
                      </code>
                    )}
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
      </div>

      {/* A refused save reports in the action bar, beside the buttons, and keeps the form (U-1). */}
      <FormActionBar failure={props.failure} placement="dialog">
        <Button variant="secondary" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          loading={props.submitting}
          onClick={() => {
            if (!canSubmit) {
              setNameError(true);

              return;
            }

            props.onSubmit({
              name: name.trim(),
              description: description.trim(),
              permissions: picked,
            });
          }}
        >
          {props.state.mode === "edit" ? "Save role" : "Create role"}
        </Button>
      </FormActionBar>
    </>
  );
}

/** The Delete role confirm's line, from the detail and the row menu alike. */
function deleteDescription(assignmentCount: number): string {
  if (assignmentCount === 0) return "It has no assignments.";

  return assignmentCount === 1
    ? "Its 1 assignment goes with it."
    : `Its ${assignmentCount} assignments go with it.`;
}

/** "Built-in" or "Custom", one fact on the table and the card (G13, ADM-4L). */
function kindPill(role: Role) {
  return (
    <LabelPill>{role.kind === "system" ? "Built-in" : "Custom"}</LabelPill>
  );
}

const HOLDERS_SHOWN = 10;

/**
 * The Assigned to card (`d8l5.61`, role-detail.prototype.html): the first ten assignments of the
 * effective-access read by role, groups first, then by name, each with its tile, its record,
 * Paused with its reason, its kind and who assigned it when. The foot links the rest and Access.
 */
function HolderCard(props: {
  readonly roleId: string;
  readonly holders: RoleHolders | undefined;
  readonly holderHref?: RolesScreenProps["holderHref"];
  readonly timeZone: string;
  readonly onOpenInAccess?: (() => void) | undefined;
  /** The card's grid placement. */
  readonly className: string;
}) {
  const headingId = useId();
  const { holders } = props;

  const rows =
    holders === undefined
      ? []
      : overviewRows({
          subject: { type: "role", id: props.roleId },
          paths: holders.paths,
          personPaths: undefined,
          catalogue: [],
          recipients: { groups: [], people: [] },
          recordLabels: new Map(),
        })
          .toSorted(
            (a, b) =>
              Number(a.holder.type === "user") -
                Number(b.holder.type === "user") ||
              a.holder.name.localeCompare(b.holder.name, undefined, {
                sensitivity: "base",
              })
          )
          .slice(0, HOLDERS_SHOWN);

  return (
    <section
      aria-labelledby={headingId}
      className={`flex flex-col rounded-xl border border-border bg-card ${props.className}`}
    >
      <h3
        id={headingId}
        className="flex items-center gap-2 px-4 pt-4 pb-3 text-base font-semibold text-foreground md:px-5"
      >
        Assigned to
        {holders === undefined ? null : (
          <CountPill tone="neutral">{holders.total}</CountPill>
        )}
      </h3>
      {holders === undefined ? (
        <p
          role="status"
          className="px-4 pb-4 text-sm text-muted-foreground md:px-5"
        >
          Loading assignments…
        </p>
      ) : rows.length === 0 ? (
        <div className="border-t border-border px-4 py-5 md:px-5">
          <EmptyState
            title="Not assigned to anyone"
            description="Assign it to a group or a person in Access."
          />
        </div>
      ) : (
        // The card row keeps px-4, so md:px-1 brings its content to the card's md:px-5 text edge.
        <div className="border-t border-border md:px-1">
          <DataTable
            label="Assigned to"
            layout="cards"
            framed={false}
            rows={rows}
            rowKey={(row) => row.key}
            rowLabel={(row) => row.holder.name}
            columns={[
              { id: "name", header: "Name", cell: (row) => row.holder.name },
            ]}
            rowLinks={props.holderHref !== undefined}
            card={{
              media: (row) =>
                row.holder.type === "group" ? (
                  <IconTile>
                    {row.holder.source === "idp" ? (
                      <DirectoryIcon />
                    ) : (
                      <LocalIcon />
                    )}
                  </IconTile>
                ) : (
                  <Avatar size="lg" aria-hidden="true">
                    <AvatarFallback>{initials(row.holder.name)}</AvatarFallback>
                  </Avatar>
                ),
              title: (row) => {
                const href = props.holderHref?.(row.holder);

                // The name covers its row, so the whole row is its touch area (C06-4).
                return href === undefined ? (
                  row.holder.name
                ) : (
                  <PageLink
                    href={href}
                    className={`font-medium text-foreground underline wrap-anywhere after:absolute after:inset-0 ${focusRing}`}
                  >
                    {row.holder.name}
                  </PageLink>
                );
              },
              badge: (row) =>
                row.record === null && row.notInEffect.length === 0 ? null : (
                  <>
                    {row.record === null ? null : (
                      <LabelPill>
                        <span className="wrap-anywhere">{row.record}</span>
                      </LabelPill>
                    )}
                    {row.notInEffect.map((reason) => (
                      <StatusPill key={reason} tone="warning">
                        {pausedLabel(reason)}
                      </StatusPill>
                    ))}
                  </>
                ),
              detail: (row) => holderLine(row.holder, holders.memberCounts),
              note: (row) => assignedLabel(row, props.timeZone),
            }}
          />
        </div>
      )}
      {holders === undefined ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 md:px-5">
          {holders.total > HOLDERS_SHOWN ? (
            <PageLink
              href={accessHref({ role: props.roleId })}
              className={`inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline ${focusRing}`}
            >
              See all {holders.total} assignments
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </PageLink>
          ) : (
            <p className="text-sm text-muted-foreground">
              Every member of an assigned group has this role.
            </p>
          )}
          {props.onOpenInAccess === undefined ? null : (
            <Button
              variant="secondary"
              className="max-sm:w-full"
              onClick={props.onOpenInAccess}
            >
              <KeyIcon /> Manage in Access
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** The role detail: header actions, permission groups with the entitlement state, and holders. */
function RoleDetailView(props: {
  readonly detail: RoleDetail;
  readonly holders: RoleHolders | undefined;
  readonly holderHref?: RolesScreenProps["holderHref"];
  readonly catalogue: readonly RolePermissionGroup[];
  readonly timeZone: string;
  readonly onEdit: () => void;
  readonly onCopy: () => void;
  readonly onDelete: () => void;
  readonly onOpenInAccess?: (() => void) | undefined;
  readonly onRemoveUnavailable: (key: string) => void;
  readonly pending?: boolean | undefined;
}) {
  const { detail } = props;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const permissionsHeadingId = useId();
  const keysLabelId = useId();

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {/* No card around the head (role-detail.prototype.html). It stays a section, so the e2e finds it by its heading. */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-foreground">
              {detail.name}
            </h2>
            <LabelPill>
              {detail.kind === "system" ? "Built-in role" : "Custom role"}
            </LabelPill>
          </div>
          {detail.description === "" && detail.kind === "custom" ? null : (
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              {detail.description === "" ? null : (
                <span>{detail.description}</span>
              )}
              {detail.description === "" || detail.kind === "custom"
                ? null
                : " "}
              {detail.kind === "system" ? (
                <span>
                  Built-in roles cannot be edited. Copy one to make your own
                  version.
                </span>
              ) : null}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {detail.kind === "system" ? (
            // The role dialog closes on submit, so its opener shows the running write.
            <Button
              variant="secondary"
              loading={props.pending}
              onClick={props.onCopy}
            >
              <CopyIcon /> Copy as new role
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                loading={props.pending}
                onClick={props.onEdit}
              >
                <PencilIcon /> Edit role
              </Button>
              <Button
                variant="danger-outline"
                loading={props.pending}
                onClick={() => setConfirmDelete(true)}
              >
                <TrashIcon /> Delete role
              </Button>
            </>
          )}
        </div>
      </section>

      {/* Holders first in reading order, so a phone shows them first (A-8). From lg the permissions take the wider left column. */}
      {/* oxlint-disable-next-line shadcn/no-arbitrary-values -- role-detail.prototype.html draws the permissions 1.15 times wider */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
        <HolderCard
          className="lg:col-start-2 lg:row-start-1"
          roleId={detail.id}
          holders={props.holders}
          holderHref={props.holderHref}
          timeZone={props.timeZone}
          onOpenInAccess={props.onOpenInAccess}
        />
        <section
          aria-labelledby={permissionsHeadingId}
          className="rounded-xl border border-border bg-card pb-1 lg:col-start-1 lg:row-start-1"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-5">
            <h3
              id={permissionsHeadingId}
              className="text-base font-semibold text-foreground"
            >
              What this role allows
            </h3>
            {/* The visible words name the switch (WCAG 2.5.3), as SwitchField does. */}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span id={keysLabelId}>Show keys</span>
              <Switch
                aria-labelledby={keysLabelId}
                checked={showKeys}
                onCheckedChange={(checked) => setShowKeys(checked)}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-1 pb-2 md:px-5">
            <p className="text-sm text-muted-foreground">
              {permissionCountLine(detail.permissionGroups)}
            </p>
            {detail.kind === "system" &&
            detail.name === TENANT_ADMINISTRATOR_ROLE ? (
              <HelpDisclosure label="Why does it include module admin?">
                A tenant administrator runs the whole admin portal, so this role
                gets the admin screens of every module that is on. It does not
                open the records inside a module, such as invoices. For that,
                give the module&apos;s own role.
              </HelpDisclosure>
            ) : null}
          </div>
          {detail.permissionGroups.map((group) => (
            <div
              key={group.moduleId}
              className="border-t border-border px-4 py-3 md:px-5"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {group.moduleName}
                </span>
                {group.moduleId === "core" ? null : (
                  <StatusPill tone={group.entitled ? "success" : "neutral"}>
                    {group.entitled ? "Module on" : "Module off"}
                  </StatusPill>
                )}
              </div>
              <ul className="mt-1">
                {group.keys.map((entry) => (
                  <li
                    key={entry.key}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1 text-sm text-foreground"
                  >
                    <span className="min-w-40 flex-1">
                      {entry.label}
                      {detail.entitlementAdded.includes(entry.key) ? (
                        <span className="block text-xs text-muted-foreground">
                          Added automatically for administrators
                        </span>
                      ) : null}
                    </span>
                    {showKeys && entry.label !== entry.key ? (
                      <code className="text-xs text-muted-foreground wrap-anywhere">
                        {entry.key}
                      </code>
                    ) : null}
                    {entry.unavailable ? (
                      <>
                        <span className="flex items-center gap-1.5 text-xs text-destructive dark:text-destructive-on-dark">
                          <WarningIcon className={`size-4 ${iconLead}`} />
                          <span>
                            Unavailable,{" "}
                            {unavailableReasonLabel(
                              entry.unavailableReason ?? "retired"
                            )}
                          </span>
                        </span>
                        {detail.kind === "custom" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={props.pending}
                            onClick={() => props.onRemoveUnavailable(entry.key)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${detail.name}?`}
        description={deleteDescription(detail.assignmentCount)}
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
 * The Roles directory and detail (R-33, R-33b). A built-in role is read-only and copyable; a custom
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

  // The row menu's Delete confirm. Closing keeps the role, so the title holds during the exit.
  const [deleting, setDeleting] = useState<{
    readonly role: Role;
    readonly open: boolean;
  } | null>(null);

  const submission = useDialogSubmit();
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
        form.unavailableKeys ??
        (props.selectedRoleId === null
          ? []
          : (props.detail?.unavailableKeys ?? []))
      }
      failure={submission.failure}
      submitting={submission.submitting}
      onCancel={() => {
        submission.clear();
        setFormOpen(false);
      }}
      // An edit updates the selected role by id; a create or a copy makes a new row.
      onSubmit={(input) =>
        submission.submit(
          () =>
            form.mode === "edit" && form.roleId !== undefined
              ? props.onUpdateRole?.(form.roleId, input)
              : props.onCreateRole?.(input),
          () => setFormOpen(false)
        )
      }
    />
  );

  if (props.selectedRoleId !== null) {
    if (props.detail === undefined) {
      // A failed read shows its error, as the list does, never an endless loading line (G50).
      return (
        <div>
          {props.error === undefined ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading role…
            </p>
          ) : (
            <p
              role="alert"
              className="text-sm text-destructive dark:text-destructive-on-dark"
            >
              {props.error}
            </p>
          )}
          {formDialog}
        </div>
      );
    }

    return (
      <div>
        <RoleDetailView
          detail={props.detail}
          holders={props.holders}
          holderHref={props.holderHref}
          catalogue={props.catalogue}
          timeZone={props.viewer.timeZone}
          pending={props.pending}
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
          onOpenInAccess={
            props.onOpenInAccess === undefined
              ? undefined
              : () => props.onOpenInAccess?.(props.detail!.id)
          }
          onRemoveUnavailable={(key) =>
            props.onRemoveUnavailableKey?.(props.detail!.id, {
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
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <label htmlFor={searchId} className="sr-only">
            {props.searchLabel}
          </label>
          {/* The captures draw a magnifier inside every list search. */}
          <InputGroup className="min-w-0 flex-1 sm:w-72 sm:flex-none">
            <InputGroupInput
              id={searchId}
              aria-label={props.searchLabel}
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
          <HelpDisclosure label="How roles work" iconOnly>
            A built-in role is read-only and can be copied as a new role. A
            custom role is editable. Access gives a role to a person or a group.
          </HelpDisclosure>
        </div>
        <Button
          className="max-md:hidden"
          loading={props.pending}
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
        <p
          role="alert"
          className="mt-3 text-sm text-destructive dark:text-destructive-on-dark"
        >
          {props.error}
        </p>
      )}

      {props.loading ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading roles…
        </p>
      ) : filtered.length === 0 ? (
        <NoMatch copy={props.noMatch} onClear={() => setQuery("")} />
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
              {
                id: "kind",
                header: "Kind",
                cell: (role) => kindPill(role),
              },
              {
                id: "permissions",
                header: "Permissions",
                cell: (role) => role.permissions.length,
                align: "end",
              },
              {
                id: "assignments",
                header: "Assignments",
                cell: (role) => role.assignmentCount,
                align: "end",
              },
            ]}
            card={{
              title: (role) => role.name,
              badge: (role) => kindPill(role),
              detail: (role) =>
                role.description === "" ? null : role.description,
              facts: (role) => [
                `${role.permissions.length} permission${role.permissions.length === 1 ? "" : "s"}`,
                `${role.assignmentCount} assignment${role.assignmentCount === 1 ? "" : "s"}`,
              ],
            }}
            // G42: the mockup's row menu. A system role is only copied; a custom one is edited too.
            actions={(role) => {
              const copy = {
                label: "Copy as new role",
                onSelect: () =>
                  openForm({
                    mode: "copy",
                    name: `${role.name} copy`,
                    description: role.description,
                    permissions: role.permissions,
                    unavailableKeys: role.unavailableKeys,
                  }),
              };

              return role.kind === "system"
                ? [copy]
                : [
                    {
                      label: "Edit",
                      onSelect: () =>
                        openForm({
                          mode: "edit",
                          roleId: role.id,
                          name: role.name,
                          description: role.description,
                          permissions: role.permissions,
                          unavailableKeys: role.unavailableKeys,
                        }),
                    },
                    copy,
                    {
                      label: "Delete",
                      danger: true,
                      onSelect: () => setDeleting({ role, open: true }),
                    },
                  ];
            }}
            footer="Built-in roles cannot be edited. Copy one as a new role to change it."
          />
        </div>
      )}

      <StickyActionBar>
        <Button
          loading={props.pending}
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
      </StickyActionBar>

      {formDialog}

      <ConfirmDialog
        open={deleting?.open ?? false}
        title={`Delete ${deleting?.role.name ?? ""}?`}
        description={deleteDescription(deleting?.role.assignmentCount ?? 0)}
        confirmLabel="Delete role"
        danger
        onConfirm={() => {
          if (deleting === null) return;

          setDeleting({ ...deleting, open: false });
          props.onDeleteRole?.(deleting.role.id);
        }}
        onClose={() =>
          setDeleting((current) =>
            current === null ? null : { ...current, open: false }
          )
        }
      />
    </div>
  );
}

/** The list-body wrapper the detail view's permission picker needs; kept for future reuse. */
export function RolePermissionList(props: { readonly children: ReactNode }) {
  return <div className="mt-2 space-y-2">{props.children}</div>;
}
