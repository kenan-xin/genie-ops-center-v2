"use client";

import {
  Button,
  FieldDescription,
  FieldError,
  FieldLabel,
  FormActionBar,
  HelpDisclosure,
  Input,
  RadioGroup,
  RadioGroupItem,
  SwitchField,
} from "@genie/ui";
import {
  type AnyFieldApi,
  type AnyFormApi,
  useForm,
  useStore,
} from "@tanstack/react-form";
import { useEffect, type ReactNode } from "react";

import {
  sessionSettingsSchema,
  signInSettingsSchema,
} from "../../services/settings/schemas.ts";
import type { SessionsInput, SettingsIssue, SignInInput } from "./types.ts";

export type FooterState = {
  readonly dirty: boolean;
  readonly canSubmit: boolean;
  readonly submitting: boolean;
  readonly submit: () => void;
  readonly reset: () => void;
};

/**
 * The save failure, Discard and Save: the same under every section. The failure is the host's
 * whole copy (what was not saved, the cause, that the edit is kept); Save is the retry.
 */
export function SectionFooter(props: {
  readonly state: FooterState;
  readonly failure: string | null;
}) {
  const { state } = props;

  return (
    <FormActionBar failure={props.failure} placement="section">
      <Button variant="secondary" disabled={!state.dirty} onClick={state.reset}>
        Discard
      </Button>
      <Button
        disabled={!state.canSubmit && !state.submitting}
        loading={state.submitting}
        onClick={state.submit}
      >
        Save
      </Button>
    </FormActionBar>
  );
}

type SectionProps<T> = {
  readonly values: T;
  readonly onSubmit: (values: T) => Promise<void>;
  readonly onDirtyChange: (dirty: boolean) => void;
  /** A refused save's issues for this section; each shows under the field it names. */
  readonly issues?: readonly SettingsIssue[] | undefined;
  readonly footer: (state: FooterState) => ReactNode;
};

/** Editing a field clears the server error it carried (DR-20 S3-06). */
const clearServerError = ({ fieldApi }: { readonly fieldApi: AnyFieldApi }) =>
  fieldApi.setMeta((prev) => ({
    ...prev,
    errorMap: { ...prev.errorMap, onServer: undefined },
  }));

/** A refused save's issues become each named field's `onServer` error; an edit clears it. */
function useServerIssues(
  form: AnyFormApi,
  issues: readonly SettingsIssue[] | undefined
): void {
  useEffect(() => {
    for (const issue of issues ?? [])
      form.setFieldMeta(issue.path, (prev) => ({
        ...prev,
        errorMap: { ...prev.errorMap, onServer: { message: issue.message } },
      }));
  }, [form, issues]);
}

/** The form state every core section hands its footer, from the TanStack Form store. */
function useFooterState(
  form: AnyFormApi,
  onDirtyChange: (dirty: boolean) => void
): FooterState {
  const dirty = useStore(form.store, (state) => !state.isDefaultValue);
  const canSubmit = useStore(form.store, (state) => state.canSubmit);
  const submitting = useStore(form.store, (state) => state.isSubmitting);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  return {
    dirty,
    canSubmit: dirty && canSubmit,
    submitting,
    submit: () => void form.handleSubmit(),
    reset: () => form.reset(),
  };
}

const ONBOARDING_OPTIONS = [
  {
    value: "invite",
    label: "Invite only",
    help: "Only people an administrator adds can sign in.",
  },
  {
    value: "jit",
    label: "Just-in-time",
    help: "People in a group mapped to a role are added on first sign-in.",
  },
] as const;

/** Onboarding mode and local accounts (R-74). The realm's own support is read-only here. */
export function SignInSection(
  props: SectionProps<SignInInput> & {
    readonly realmSupportsLocalAccounts: boolean;
    /** Shown under the disabled switch when the realm holds no local accounts. */
    readonly localAccountsNote: string;
  }
) {
  const form = useForm({
    defaultValues: props.values,
    validators: { onChange: signInSettingsSchema },
    listeners: { onChange: clearServerError },
    onSubmit: async ({ value }) => props.onSubmit(value),
  });

  useServerIssues(form, props.issues);

  const footer = useFooterState(form, props.onDirtyChange);

  return (
    <>
      <div className="flex flex-col gap-6 px-5 py-5">
        <form.Field name="onboardingMode">
          {(field) => (
            <div data-field="onboardingMode" className="flex flex-col gap-1.5">
              <span
                id="core-onboardingMode-label"
                className="text-sm font-medium"
              >
                Onboarding mode
              </span>
              <RadioGroup
                aria-labelledby="core-onboardingMode-label"
                value={field.state.value}
                onValueChange={(value) => {
                  const option = ONBOARDING_OPTIONS.find(
                    (item) => item.value === value
                  );

                  if (option !== undefined) field.handleChange(option.value);
                }}
              >
                {ONBOARDING_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 has-data-checked:border-primary"
                  >
                    <RadioGroupItem value={option.value} className="mt-0.5" />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold">
                        {option.label}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {option.help}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          )}
        </form.Field>

        <form.Field name="localAccountsEnabled">
          {(field) => (
            <div
              data-field="localAccountsEnabled"
              className="flex flex-col gap-1.5"
            >
              <SwitchField
                label="Allow local accounts"
                description="Add person also creates the account in the tenant realm and sends a set-password email."
                checked={field.state.value}
                // A saved "on" stays switchable, so it can be turned off; only turning it on needs the realm.
                disabled={
                  !props.realmSupportsLocalAccounts &&
                  !props.values.localAccountsEnabled
                }
                onCheckedChange={field.handleChange}
              />
              {props.realmSupportsLocalAccounts ? null : (
                <p className="text-xs text-muted-foreground">
                  {props.localAccountsNote}
                </p>
              )}
            </div>
          )}
        </form.Field>
      </div>
      {props.footer(footer)}
    </>
  );
}

/** The idle timeout (R-73). An emptied field holds NaN, which the schema refuses with its text. */
export function SessionsSection(props: SectionProps<SessionsInput>) {
  const form = useForm({
    defaultValues: props.values,
    validators: { onChange: sessionSettingsSchema },
    listeners: { onChange: clearServerError },
    onSubmit: async ({ value }) => props.onSubmit(value),
  });

  useServerIssues(form, props.issues);

  const footer = useFooterState(form, props.onDirtyChange);

  return (
    <>
      <div className="px-5 py-5">
        <form.Field name="sessionIdleMinutes">
          {(field) => {
            const issue: { message?: string } | undefined =
              field.state.meta.errors[0];

            const message = field.state.meta.isTouched
              ? issue?.message
              : undefined;

            return (
              <div
                data-field="sessionIdleMinutes"
                className="flex flex-col gap-1.5"
              >
                <FieldLabel htmlFor="core-sessionIdleMinutes">
                  Idle timeout
                </FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="core-sessionIdleMinutes"
                    type="number"
                    inputMode="numeric"
                    className="max-w-30"
                    value={
                      Number.isNaN(field.state.value)
                        ? ""
                        : String(field.state.value)
                    }
                    aria-invalid={message === undefined ? undefined : true}
                    aria-describedby={
                      message === undefined
                        ? "core-sessionIdleMinutes-help"
                        : "core-sessionIdleMinutes-error"
                    }
                    onChange={(event) =>
                      field.handleChange(event.target.valueAsNumber)
                    }
                    onBlur={field.handleBlur}
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
                {message === undefined ? (
                  <FieldDescription id="core-sessionIdleMinutes-help">
                    5 to 480 minutes. Default 15.
                  </FieldDescription>
                ) : (
                  <FieldError id="core-sessionIdleMinutes-error">
                    {message}
                  </FieldError>
                )}
                <HelpDisclosure label="When a new timeout applies">
                  <p>
                    A new timeout applies to new sessions, and to existing
                    sessions on their next activity.
                  </p>
                </HelpDisclosure>
              </div>
            );
          }}
        </form.Field>
      </div>
      {props.footer(footer)}
    </>
  );
}
