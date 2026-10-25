"use client";

import {
  Button,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  RadioGroup,
  RadioGroupItem,
  SwitchField,
} from "@genie/ui";
import { type AnyFormApi, useForm, useStore } from "@tanstack/react-form";
import { AlertTriangle } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import {
  sessionSettingsSchema,
  signInSettingsSchema,
} from "../../services/settings/schemas.ts";
import type { LastChangedView, SessionsInput, SignInInput } from "./types.ts";

export type FooterState = {
  readonly dirty: boolean;
  readonly canSubmit: boolean;
  readonly submitting: boolean;
  readonly submit: () => void;
  readonly reset: () => void;
};

function formatInstant(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function lastChangedText(
  lastChanged: LastChangedView,
  timeZone: string
): string {
  if (lastChanged === null) return "Never changed";

  const by = lastChanged.by === null ? "provisioning" : lastChanged.by;

  return `Last changed by ${by} · ${formatInstant(lastChanged.at, timeZone)}`;
}

/** Last change, the save failure line, Discard and Save: the same under every section. */
export function SectionFooter(props: {
  readonly state: FooterState;
  readonly lastChanged: LastChangedView;
  readonly timeZone: string;
  readonly failure: string | null;
}) {
  const { state } = props;

  return (
    <div className="flex flex-col gap-2 border-t border-border px-5 py-3">
      {props.failure === null ? null : (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-x-1.5 text-xs text-destructive"
        >
          <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
          Not saved. {props.failure} Your changes are still here.
          <Button variant="link" size="sm" onClick={state.submit}>
            Retry
          </Button>
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {lastChangedText(props.lastChanged, props.timeZone)}
        </p>
        <div className="flex gap-2 *:flex-1 sm:*:flex-none">
          <Button
            variant="secondary"
            disabled={!state.dirty}
            onClick={state.reset}
          >
            Discard
          </Button>
          <Button
            disabled={!state.canSubmit && !state.submitting}
            loading={state.submitting}
            onClick={state.submit}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

type SectionProps<T> = {
  readonly values: T;
  readonly onSubmit: (values: T) => Promise<void>;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly footer: (state: FooterState) => ReactNode;
};

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
  }
) {
  const form = useForm({
    defaultValues: props.values,
    validators: { onChange: signInSettingsSchema },
    onSubmit: async ({ value }) => props.onSubmit(value),
  });

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
                disabled={!props.realmSupportsLocalAccounts}
                onCheckedChange={field.handleChange}
              />
              {props.realmSupportsLocalAccounts ? null : (
                <p className="text-xs text-muted-foreground">
                  The tenant realm is brokered only. Ask your Genie operator to
                  add local accounts to the realm.
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
    onSubmit: async ({ value }) => props.onSubmit(value),
  });

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
                    5 to 480 minutes, default 15. Applies to new sessions and to
                    existing sessions on their next activity.
                  </FieldDescription>
                ) : (
                  <FieldError id="core-sessionIdleMinutes-error">
                    {message}
                  </FieldError>
                )}
              </div>
            );
          }}
        </form.Field>
      </div>
      {props.footer(footer)}
    </>
  );
}
