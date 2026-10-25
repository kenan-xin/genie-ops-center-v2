"use client";

import { useForm, useStore, type AnyFieldApi } from "@tanstack/react-form";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { z } from "zod";

import { Button } from "../components/button.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "../components/field.tsx";
import { Input } from "../components/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select.tsx";
import {
  configFieldChoices,
  configFieldKind,
  configFieldMessage,
  configFormValidator,
  type ConfigFieldSchema,
  type ConfigFormField,
  type ConfigFormSchema,
  type ConfigValue,
} from "./config-form-schema.ts";
import { SwitchField } from "./switch-field.tsx";

export type ConfigFormFooterState = {
  readonly dirty: boolean;
  readonly canSubmit: boolean;
  readonly submitting: boolean;
  readonly submit: () => void;
  readonly reset: () => void;
};

export type ConfigFormProps = {
  readonly schema: ConfigFormSchema;
  readonly fields: readonly ConfigFormField[];
  /** The stored values. A new object (after a save) becomes the form's clean state. */
  readonly values: Readonly<Record<string, ConfigValue>>;
  /** Field element ids are `${idPrefix}-${field.id}`. */
  readonly idPrefix: string;
  readonly disabled?: boolean;
  readonly onSubmit: (values: Record<string, ConfigValue>) => Promise<void>;
  readonly onDirtyChange?: (dirty: boolean) => void;
  /** The field a link named; it takes focus once. */
  readonly focusFieldId?: string | undefined;
  readonly footer: (state: ConfigFormFooterState) => ReactNode;
};

const formatNumber = (n: number): string => n.toLocaleString("en-GB");

function rangeText(field: ConfigFieldSchema): string {
  if (field.type !== "number" && field.type !== "integer") return "";

  const { minimum: min, maximum: max } = field;

  if (min !== undefined && max !== undefined)
    return `From ${formatNumber(min)} to ${formatNumber(max)}.`;

  if (min !== undefined) return `At least ${formatNumber(min)}.`;

  return max === undefined ? "" : `At most ${formatNumber(max)}.`;
}

/**
 * Renders a module's configuration from plain JSON Schema: five field kinds and nothing else
 * (DEC-28, R-75, R-76). Never a form engine.
 */
export function ConfigForm({
  schema,
  fields,
  values,
  idPrefix,
  disabled = false,
  onSubmit,
  onDirtyChange,
  focusFieldId,
  footer,
}: ConfigFormProps) {
  const validator = useMemo(
    () => configFormValidator(schema, fields),
    [schema, fields]
  );

  const root = useRef<HTMLDivElement>(null);
  const shownValues = useRef(values);

  // A stored value that already fails shows its message at once (R-80); others wait for blur.
  const failedOnLoad = useMemo(
    () =>
      new Set(
        fields
          .filter((meta) => {
            const field = schema.properties[meta.id];

            return (
              field !== undefined &&
              configFieldMessage(field, meta, values[meta.id]) !== null
            );
          })
          .map((meta) => meta.id)
      ),
    [schema, fields, values]
  );

  const form = useForm({
    defaultValues: { ...values },
    validators: { onMount: validator, onChange: validator, onBlur: validator },
    onSubmit: async ({ value }) => onSubmit({ ...value }),
  });

  const dirty = useStore(form.store, (state) => !state.isDefaultValue);
  const canSubmit = useStore(form.store, (state) => state.canSubmit);
  const submitting = useStore(form.store, (state) => state.isSubmitting);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (shownValues.current === values) return;

    shownValues.current = values;
    form.reset({ ...values });
  }, [form, values]);

  useEffect(() => {
    if (focusFieldId === undefined) return;

    root.current
      ?.querySelector(`[data-field="${CSS.escape(focusFieldId)}"]`)
      ?.querySelector<HTMLElement>(
        "input:not([aria-hidden]), [role=switch], [role=combobox]"
      )
      ?.focus();
  }, [focusFieldId]);

  return (
    <div ref={root} className="flex flex-col gap-6">
      <div className="flex flex-col gap-5">
        {fields.map((meta) => {
          const field = schema.properties[meta.id];

          if (field === undefined) return null;

          return (
            <form.Field key={meta.id} name={meta.id}>
              {(api) => (
                <ConfigFormControl
                  api={api}
                  field={field}
                  meta={meta}
                  id={`${idPrefix}-${meta.id}`}
                  disabled={disabled}
                  showError={
                    api.state.meta.isBlurred || failedOnLoad.has(meta.id)
                  }
                />
              )}
            </form.Field>
          );
        })}
      </div>
      {footer({
        dirty,
        canSubmit: dirty && canSubmit && !disabled,
        submitting,
        submit: () => void form.handleSubmit(),
        reset: () => form.reset({ ...values }),
      })}
    </div>
  );
}

function counter(count: number, limit: number | undefined) {
  if (limit === undefined) return null;

  return (
    <span
      className={
        count > limit
          ? "text-xs text-destructive"
          : "text-xs text-muted-foreground"
      }
    >
      {count}/{limit}
    </span>
  );
}

type ControlProps = {
  readonly api: AnyFieldApi;
  readonly field: ConfigFieldSchema;
  readonly meta: ConfigFormField;
  readonly id: string;
  readonly disabled: boolean;
  readonly showError: boolean;
};

/** One field. Its error replaces its description and names it through `aria-describedby`. */
function ConfigFormControl({
  api,
  field,
  meta,
  id,
  disabled,
  showError,
}: ControlProps) {
  const kind = configFieldKind(field);
  const value: ConfigValue = api.state.value;
  const issue: { message?: string } | undefined = api.state.meta.errors[0];
  const message = showError ? issue?.message : undefined;

  const descriptionText = [meta.description, rangeText(field)]
    .filter(Boolean)
    .join(" ");

  const describedBy =
    message === undefined ? `${id}-description` : `${id}-error`;

  const invalid = message !== undefined;

  const help =
    message === undefined ? (
      descriptionText === "" ? null : (
        <FieldDescription id={`${id}-description`}>
          {descriptionText}
        </FieldDescription>
      )
    ) : (
      <FieldError id={`${id}-error`}>{message}</FieldError>
    );

  if (kind === "boolean") {
    return (
      <div data-field={meta.id} className="flex flex-col gap-1.5">
        <SwitchField
          label={meta.title}
          description={meta.description ?? ""}
          checked={value === true}
          disabled={disabled}
          onCheckedChange={(checked) => {
            api.handleChange(checked);
            api.handleBlur();
          }}
        />
        {message === undefined ? null : (
          <FieldError id={`${id}-error`}>{message}</FieldError>
        )}
      </div>
    );
  }

  if (kind === "stringList" && field.type === "array") {
    const list = z.array(z.string()).catch([]).parse(value);

    const atLimit =
      field.maxItems !== undefined && list.length >= field.maxItems;

    return (
      <Field data-field={meta.id}>
        <div className="flex items-baseline justify-between gap-3">
          <span
            id={`${id}-label`}
            className="text-sm font-medium text-foreground"
          >
            {meta.title}
          </span>
          {counter(list.length, field.maxItems)}
        </div>
        <ul aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
          {list.map((entry, index) => (
            // Entries have no identity but their position, which is what the messages name.
            // oxlint-disable-next-line react/no-array-index-key
            <li key={index} className="flex items-center gap-2">
              <Input
                aria-label={`${meta.title} ${index + 1}`}
                value={entry}
                disabled={disabled}
                onChange={(event) =>
                  api.handleChange(
                    list.map((item, at) =>
                      at === index ? event.target.value : item
                    )
                  )
                }
                onBlur={api.handleBlur}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove entry ${index + 1}`}
                disabled={disabled}
                onClick={() => {
                  api.handleChange(list.filter((_, at) => at !== index));
                  api.handleBlur();
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          className="w-fit"
          disabled={disabled || atLimit}
          onClick={() => api.handleChange([...list, ""])}
        >
          <Plus aria-hidden />
          Add entry
        </Button>
        {help}
      </Field>
    );
  }

  if (kind === "enum") {
    const items = configFieldChoices(field);

    return (
      <Field data-field={meta.id}>
        <FieldLabel id={`${id}-label`}>{meta.title}</FieldLabel>
        <Select
          items={items}
          value={z.string().nullable().catch(null).parse(value)}
          disabled={disabled}
          onValueChange={(next) => {
            if (next !== null) api.handleChange(next);

            api.handleBlur();
          }}
        >
          <SelectTrigger
            id={id}
            aria-labelledby={`${id}-label`}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className="sm:max-w-80"
          >
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {help}
      </Field>
    );
  }

  if (kind === "number") {
    return (
      <Field data-field={meta.id}>
        <FieldLabel htmlFor={id}>{meta.title}</FieldLabel>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={value === undefined ? "" : String(value)}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="sm:max-w-60"
          onChange={(event) =>
            api.handleChange(
              event.target.value === "" ? undefined : event.target.valueAsNumber
            )
          }
          onBlur={api.handleBlur}
        />
        {help}
      </Field>
    );
  }

  const text = z.string().catch("").parse(value);

  const maxLength =
    field.type === "string" && field.enum === undefined
      ? field.maxLength
      : undefined;

  return (
    <Field data-field={meta.id}>
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={id}>{meta.title}</FieldLabel>
        {counter(text.length, maxLength)}
      </div>
      <Input
        id={id}
        value={text}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => api.handleChange(event.target.value)}
        onBlur={api.handleBlur}
      />
      {help}
    </Field>
  );
}
