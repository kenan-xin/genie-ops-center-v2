"use client";

import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldTitle,
  FormActionBar,
  RadioGroup,
  RadioGroupItem,
} from "@genie/ui";
import { ChevronLeftIcon, XIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import type { Scope } from "../../lib/module-contract/keys.ts";
import type {
  RecipientPage,
  RecipientRow,
} from "../../services/roles/recipients.ts";
import type { ScopeRecord } from "../../services/roles/records.ts";
import type { RoleChoice, RoleChoiceGroup } from "./add-assignment-view.ts";
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

type FormErrors = {
  readonly to?: true | undefined;
  readonly role?: true | undefined;
  readonly record?: true | undefined;
};

const refusalText = (cause: unknown) => {
  // SAFETY: a refusal is thrown as `{ message }` by the host; any other value reads as no message.
  const message =
    cause instanceof Error
      ? cause.message
      : ((cause as { readonly message?: string } | null)?.message ??
        "Try again.");

  return `The assignment was not added. ${message}`;
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

  const [failure, setFailure] = useState<string | null>(null);

  const toErrorId = useId();

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
      setFailure(refusalText(cause));
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
          onClick={props.onCancel}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>

      <div
        inert={saving}
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4"
      >
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
            <FieldTitle>Assign to</FieldTitle>
            <div className="flex items-center gap-3">
              <RecipientMark type={fixed.type} name={fixed.name} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">
                  {fixed.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fixed.type === "user" ? "Person" : recipientDetail(fixed)}
                </span>
              </span>
            </div>
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
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="all" />
                All records
              </label>
              <label className="flex items-center gap-2 text-sm">
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
        <FormActionBar failure={failure}>
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
