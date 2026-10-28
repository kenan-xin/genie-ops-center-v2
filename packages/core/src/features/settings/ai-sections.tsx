"use client";

import {
  Button,
  ConfirmDialog,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  StatusPill,
} from "@genie/ui";
import { useForm } from "@tanstack/react-form";
import { useState, type ReactNode } from "react";

import { modelKeySchema } from "../../services/settings/schemas.ts";
import {
  clearServerError,
  type FooterState,
  useFooterState,
  useServerIssues,
} from "./core-sections.tsx";
import type { ModelKeyInput, SettingsIssue } from "./types.ts";

/**
 * The write-only model provider key (R-17). The field starts empty on every visit and empties
 * again after a save, so the stored value is never shown; an empty field keeps the stored key.
 */
export function AiConnectionSection(props: {
  readonly keyStored: boolean;
  readonly onSubmit: (values: ModelKeyInput) => Promise<void>;
  readonly onRemove: () => Promise<void>;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly issues?: readonly SettingsIssue[] | undefined;
  readonly footer: (state: FooterState) => ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);

  const form = useForm({
    defaultValues: { apiKey: "" },
    validators: { onChange: modelKeySchema },
    listeners: { onChange: clearServerError },
    onSubmit: async ({ value }) => {
      await props.onSubmit(value);

      form.reset();
    },
  });

  useServerIssues(form, props.issues);

  const footer = useFooterState(form, props.onDirtyChange);

  return (
    <>
      <div className="px-5 py-5">
        <form.Field name="apiKey">
          {(field) => {
            const issue: { message?: string } | undefined =
              field.state.meta.errors[0];

            const message = field.state.meta.isTouched
              ? issue?.message
              : undefined;

            return (
              <div data-field="apiKey" className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <FieldLabel htmlFor="core-apiKey">
                    OpenRouter API key
                  </FieldLabel>
                  <StatusPill tone={props.keyStored ? "success" : "neutral"}>
                    {props.keyStored ? "Stored" : "Not stored"}
                  </StatusPill>
                </div>
                <Input
                  id="core-apiKey"
                  type="password"
                  autoComplete="off"
                  value={field.state.value}
                  aria-invalid={message === undefined ? undefined : true}
                  aria-describedby={
                    message === undefined
                      ? "core-apiKey-help"
                      : "core-apiKey-error"
                  }
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
                {message === undefined ? (
                  <FieldDescription id="core-apiKey-help">
                    Leave the field empty to keep the stored key.
                  </FieldDescription>
                ) : (
                  <FieldError id="core-apiKey-error">{message}</FieldError>
                )}
                <div>
                  <Button
                    variant="secondary"
                    disabled={!props.keyStored}
                    onClick={() => setConfirming(true)}
                  >
                    Remove key
                  </Button>
                </div>
              </div>
            );
          }}
        </form.Field>
      </div>
      {props.footer(footer)}

      <ConfirmDialog
        open={confirming}
        title="Remove the model provider key?"
        description="AI features turn off at once. To turn them on again, store a key again."
        confirmLabel="Remove key"
        danger
        onConfirm={() => {
          setConfirming(false);
          void props.onRemove();
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
