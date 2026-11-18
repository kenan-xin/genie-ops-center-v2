"use client";

import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldTitle,
  FormActionBar,
  focusRing,
  RadioGroup,
  RadioGroupItem,
  touchRowHeight,
} from "@genie/ui";
import { ChevronLeftIcon, CircleAlertIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import type { Scope } from "../../lib/module-contract/keys.ts";
import type { AddAssignmentsResult } from "../../services/roles/add-assignments.ts";
import type {
  RecipientPage,
  RecipientRow,
} from "../../services/roles/recipients.ts";
import type { ScopeRecord } from "../../services/roles/records.ts";
import { PageLink } from "../shell/page-link.tsx";
import {
  MODULES_PAGE,
  type RoleChoice,
  type RoleChoiceGroup,
} from "./add-assignment-view.ts";
import { recipientDetail } from "./assignment-words.ts";
import { RecipientField } from "./recipient-field.tsx";
import { RecipientMark } from "./recipient-mark.tsx";
import { RecordPicker } from "./record-picker.tsx";
import { RoleField } from "./role-field.tsx";

/** What the form submits: one role, one record or all records, and the recipients. */
export type AddAssignmentInput = {
  readonly roleId: string;
  readonly scope: Scope | null;
  readonly recipients: readonly RecipientRow[];
};

export type AddAssignmentFormProps = {
  /** A sheet's own person or group, or a field that picks one or more. */
  readonly to:
    | { readonly fixed: RecipientRow }
    | {
        readonly search: (query: string) => Promise<RecipientPage>;
        readonly selfId?: string | undefined;
      };
  readonly roles: readonly RoleChoiceGroup[];
  /** The role picked when the form opens: a module's default role on the module sheet. */
  readonly initialRoleId?: string | undefined;
  /** The sheet's name: shows "Back to <name>". */
  readonly backTo?: string | undefined;
  readonly onSearchRecords: (
    recordType: string,
    query: string
  ) => Promise<readonly ScopeRecord[]>;
  readonly onCancel: () => void;
  /** Resolves when saved. Rejects with `{ message }` on a refusal; the form keeps its values. */
  readonly onSubmit: (input: AddAssignmentInput) => Promise<void>;
};

/** What a sheet or Access needs to add an assignment; given only to a tenant-wide roles manager (P12-2). */
export type AddAssignmentHost = {
  readonly roles: readonly RoleChoiceGroup[];
  readonly onSearchRecords: AddAssignmentFormProps["onSearchRecords"];
  /** Resolves with the server's answer; rejects with `{ message }`, which the form shows. */
  readonly onSubmit: (
    input: AddAssignmentInput
  ) => Promise<AddAssignmentsResult>;
};

type FormErrors = {
  readonly to?: true | undefined;
  readonly role?: true | undefined;
  readonly record?: true | undefined;
};

type Refusal = { readonly reason: string; readonly code: string | undefined };

const refusalOf = (cause: unknown): Refusal => {
  if (cause instanceof Error) return { reason: cause.message, code: undefined };

  // SAFETY: a refusal is thrown as `{ message, code? }` by the host; any other value reads as no message.
  const thrown = cause as Partial<{
    readonly message: string;
    readonly code: string;
  }> | null;

  return {
    reason: thrown?.message ?? "Try again.",
    code: thrown?.code,
  };
};

/** The reason, with the Modules page linked in a module-disabled refusal (refused-1440). */
const reasonOf = (refusal: Refusal): ReactNode => {
  const at =
    refusal.code === "module-disabled"
      ? refusal.reason.lastIndexOf(MODULES_PAGE.label)
      : -1;

  if (at === -1) return refusal.reason;

  return (
    <>
      {refusal.reason.slice(0, at)}
      <PageLink
        href={MODULES_PAGE.path}
        className={`rounded-sm font-semibold underline ${focusRing}`}
      >
        {MODULES_PAGE.label}
      </PageLink>
      {refusal.reason.slice(at + MODULES_PAGE.label.length)}
    </>
  );
};

const initialChoice = (
  groups: readonly RoleChoiceGroup[],
  roleId: string | undefined
): RoleChoice | null => {
  if (roleId === undefined) return null;

  const choice = groups
    .flatMap((group) => group.choices)
    .find((candidate) => candidate.roleId === roleId);

  return choice === undefined || choice.disabled ? null : choice;
};

/** The one form that adds an assignment, from any sheet or from Access (d8l5.62). */
export function AddAssignmentForm(props: AddAssignmentFormProps): ReactNode {
  const [picks, setPicks] = useState<readonly RecipientRow[]>([]);

  const [role, setRole] = useState<RoleChoice | null>(() =>
    initialChoice(props.roles, props.initialRoleId)
  );

  const [scope, setScope] = useState<"all" | "one">("all");

  const [record, setRecord] = useState<ScopeRecord | null>(null);

  const [errors, setErrors] = useState<FormErrors>({});

  const [saving, setSaving] = useState(false);

  const [failure, setFailure] = useState<Refusal | null>(null);

  const alert = useRef<HTMLDivElement>(null);

  // Each refusal takes focus, as `FormActionBar` does; a new save clears the last one first.
  useEffect(() => {
    if (failure !== null) alert.current?.focus();
  }, [failure]);

  const toErrorId = useId();

  const toTitleId = useId();

  const helpId = useId();

  const roleErrorId = useId();

  const scopeId = useId();

  const recordErrorId = useId();

  const fixed = "fixed" in props.to ? props.to.fixed : null;

  const search = "search" in props.to ? props.to.search : null;

  const selfId = "search" in props.to ? props.to.selfId : undefined;

  const recipients = fixed === null ? picks : [fixed];

  const n = recipients.length;

  const changeRole = (choice: RoleChoice) => {
    setRole(choice);
    setScope("all");
    setRecord(null);
    setErrors((current) => ({
      ...current,
      role: undefined,
      record: undefined,
    }));
  };

  const changePicks = (next: readonly RecipientRow[]) => {
    setPicks(next);
    setErrors((current) => ({ ...current, to: undefined }));
  };

  const changeRecord = (next: ScopeRecord) => {
    setRecord(next);
    setErrors((current) => ({ ...current, record: undefined }));
  };

  async function add() {
    const missingTo = search !== null && n === 0;

    const missingRole = role === null;

    const missingRecord =
      role !== null &&
      role.recordType !== null &&
      scope === "one" &&
      record === null;

    if (missingTo || missingRole || missingRecord) {
      setErrors({
        to: missingTo ? true : undefined,
        role: missingRole ? true : undefined,
        record: missingRecord ? true : undefined,
      });

      return;
    }

    if (role === null) return;

    setFailure(null);
    setSaving(true);

    try {
      await props.onSubmit({
        roleId: role.roleId,
        scope:
          scope === "one" && record !== null && role.recordType !== null
            ? { type: role.recordType, id: record.id }
            : null,
        recipients,
      });
    } catch (cause) {
      setFailure(refusalOf(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {props.backTo === undefined ? null : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Back to ${props.backTo}`}
            disabled={saving}
            onClick={props.onCancel}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
        )}
        <h2 className="min-w-0 flex-1 text-lg font-semibold">Add assignment</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close"
          disabled={saving}
          onClick={props.onCancel}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>

      <div
        inert={saving}
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4"
      >
        {/* A form-level block at the top of the form (DESIGN.md "Labels / Helper / Error", C12-10). */}
        {failure === null ? null : (
          <div
            ref={alert}
            role="alert"
            tabIndex={-1}
            className={`flex items-start gap-2.5 rounded-lg bg-destructive/10 px-3.5 py-3 text-sm text-destructive-text ${focusRing}`}
          >
            {/* No offset: Chrome's text rect starts at the line top, so a 16 px icon there centers on it (P07-64). */}
            <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
            <div className="grid gap-0.5">
              <p className="font-semibold">The assignment was not added.</p>
              <p>{reasonOf(failure)}</p>
            </div>
          </div>
        )}
        {fixed === null ? (
          <Field>
            <FieldTitle>Assign to</FieldTitle>
            {search === null ? null : (
              <RecipientField
                label="Assign to"
                placeholder="Search people and groups"
                multiple
                value={picks}
                onChange={changePicks}
                search={search}
                selfId={selfId}
                invalid={errors.to === true}
                describedBy={errors.to === true ? toErrorId : helpId}
              />
            )}
            {errors.to === true ? (
              <FieldError id={toErrorId}>
                Choose one or more people or groups.
              </FieldError>
            ) : (
              <FieldDescription id={helpId}>
                Pick one or more people or groups.
              </FieldDescription>
            )}
          </Field>
        ) : (
          <Field>
            <FieldTitle id={toTitleId}>Assign to</FieldTitle>
            {/* A list of one, as the picker's chips are a list: its row holds the mark's gutter (C12-3). */}
            <ul aria-labelledby={toTitleId}>
              <li className="flex items-start gap-3">
                <RecipientMark type={fixed.type} name={fixed.name} />
                {/* 8 px down, so the 32 px mark's center sits on the name line's center (C12-3). */}
                <span className="flex min-w-0 flex-col pt-2">
                  <span className="truncate text-sm font-semibold">
                    {fixed.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fixed.type === "user" ? "Person" : recipientDetail(fixed)}
                  </span>
                </span>
              </li>
            </ul>
          </Field>
        )}

        <Field>
          <FieldTitle>Role</FieldTitle>
          <RoleField
            groups={props.roles}
            value={role}
            onChange={changeRole}
            invalid={errors.role === true}
            describedBy={errors.role === true ? roleErrorId : undefined}
          />
          {errors.role === true ? (
            <FieldError id={roleErrorId}>Choose a role.</FieldError>
          ) : null}
        </Field>

        {role === null || role.recordType === null ? (
          <Field>
            <FieldTitle>Scope</FieldTitle>
            <p className="text-sm">All records</p>
          </Field>
        ) : (
          <Field>
            <FieldTitle id={scopeId}>Scope</FieldTitle>
            <RadioGroup
              aria-labelledby={scopeId}
              value={scope}
              onValueChange={(next) => {
                setScope(next === "one" ? "one" : "all");
                setErrors((current) => ({ ...current, record: undefined }));
              }}
            >
              {/* Under lg each row is 44 px tall, so the radios' touch areas do not meet (Add person's Account type). */}
              <label
                className={`flex ${touchRowHeight} items-center gap-2 text-sm`}
              >
                <RadioGroupItem value="all" />
                All records
              </label>
              <label
                className={`flex ${touchRowHeight} items-center gap-2 text-sm`}
              >
                <RadioGroupItem value="one" />
                One record
              </label>
            </RadioGroup>
            {scope === "one" ? (
              <RecordPicker
                key={role.roleId}
                recordType={role.recordType}
                value={record}
                onSearch={props.onSearchRecords}
                onPick={changeRecord}
                errorId={errors.record === true ? recordErrorId : undefined}
              />
            ) : null}
            {errors.record === true ? (
              <FieldError id={recordErrorId}>Choose a record.</FieldError>
            ) : null}
          </Field>
        )}

        {n >= 2 ? (
          <p className="text-sm text-muted-foreground">
            {`Adds ${n} assignments, one for each person and group.`}
          </p>
        ) : null}
      </div>

      <div className="border-t border-border p-4">
        <FormActionBar failure={null}>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={props.onCancel}
          >
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void add()}>
            {n > 1 ? `Add ${n} assignments` : "Add assignment"}
          </Button>
        </FormActionBar>
      </div>
    </div>
  );
}
