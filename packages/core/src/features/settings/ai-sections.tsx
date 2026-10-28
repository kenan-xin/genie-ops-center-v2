"use client";

import {
  Button,
  ConfirmDialog,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  Textarea,
} from "@genie/ui";
import { useForm, useStore } from "@tanstack/react-form";
import { isEqual, uniq } from "es-toolkit";
import { useEffect, useState, type ReactNode } from "react";

import {
  modelKeySchema,
  modelSettingsSchema,
} from "../../services/settings/schemas.ts";
import {
  clearServerError,
  type FooterState,
  type SectionProps,
  useFooterState,
  useServerIssues,
} from "./core-sections.tsx";
import type {
  ModelKeyInput,
  ModelSettingsInput,
  SettingsIssue,
} from "./types.ts";

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

/** The textarea's own text becomes the field: lines trimmed, blank lines dropped, each id once. */
function parseModelList(text: string): string[] {
  return uniq(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
  );
}

/** The allowed models and the two defaults (R-18), saved together because they are checked together. */
export function AiModelsSection(props: SectionProps<ModelSettingsInput>) {
  const form = useForm({
    defaultValues: props.values,
    validators: { onChange: modelSettingsSchema },
    listeners: { onChange: clearServerError },
    onSubmit: async ({ value }) => props.onSubmit(value),
  });

  useServerIssues(form, props.issues);

  const footer = useFooterState(form, props.onDirtyChange);

  const allowed = useStore(form.store, (state) => state.values.allowedModels);
  const dirty = useStore(form.store, (state) => !state.isDefaultValue);
  const [text, setText] = useState(() => allowed.join("\n"));

  // Typing keeps its own text; a change from outside, such as Discard, rewrites it.
  useEffect(() => {
    if (!isEqual(parseModelList(text), allowed)) setText(allowed.join("\n"));
  }, [allowed, text]);

  const items = allowed.map((id) => ({ value: id, label: id }));

  const defaultModel = (
    name: "chatModel" | "documentModel",
    label: string,
    help: string
  ) => (
    <form.Field name={name}>
      {(field) => {
        const issue: { message?: string } | undefined =
          field.state.meta.errors[0];

        const message =
          field.state.meta.isTouched ||
          dirty ||
          field.state.meta.errorMap.onServer !== undefined
            ? issue?.message
            : undefined;

        const id = `core-${name}`;

        return (
          <div data-field={name} className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Select
              items={items}
              value={field.state.value === "" ? null : field.state.value}
              onValueChange={(value) => field.handleChange(value ?? "")}
            >
              <SelectTrigger
                id={id}
                aria-invalid={message === undefined ? undefined : true}
                aria-describedby={
                  message === undefined ? `${id}-help` : `${id}-error`
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {message === undefined ? (
              <FieldDescription id={`${id}-help`}>{help}</FieldDescription>
            ) : (
              <FieldError id={`${id}-error`}>{message}</FieldError>
            )}
          </div>
        );
      }}
    </form.Field>
  );

  return (
    <>
      <div className="flex flex-col gap-6 px-5 py-5">
        <form.Field name="allowedModels">
          {(field) => {
            const issue: { message?: string } | undefined =
              field.state.meta.errors[0];

            const message =
              field.state.meta.isTouched ||
              dirty ||
              field.state.meta.errorMap.onServer !== undefined
                ? issue?.message
                : undefined;

            return (
              <div data-field="allowedModels" className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="core-allowedModels">
                  Allowed models
                </FieldLabel>
                <Textarea
                  id="core-allowedModels"
                  rows={4}
                  value={text}
                  aria-invalid={message === undefined ? undefined : true}
                  aria-describedby={
                    message === undefined
                      ? "core-allowedModels-help"
                      : "core-allowedModels-error"
                  }
                  onChange={(event) => {
                    setText(event.target.value);
                    field.handleChange(parseModelList(event.target.value));
                  }}
                  onBlur={field.handleBlur}
                />
                {message === undefined ? (
                  <FieldDescription id="core-allowedModels-help">
                    One OpenRouter model id per line, for example
                    openai/gpt-6.1-terra.
                  </FieldDescription>
                ) : (
                  <FieldError id="core-allowedModels-error">
                    {message}
                  </FieldError>
                )}
              </div>
            );
          }}
        </form.Field>

        {defaultModel(
          "chatModel",
          "Chat default",
          "A person can pick another allowed model in each chat."
        )}
        {defaultModel(
          "documentModel",
          "Document reading",
          "Document reading always uses this model."
        )}
      </div>
      {props.footer(footer)}
    </>
  );
}
