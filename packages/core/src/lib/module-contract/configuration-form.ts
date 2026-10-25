import {
  configFieldMessage,
  configFieldOptional,
  configValueSchema,
  type ConfigFormField,
  type ConfigFormSchema,
  type ConfigValue,
} from "@genie/ui/config-form-schema";
import { z } from "zod";

import type { AppErrorIssue } from "../errors/index.ts";
import type { ModuleConfiguration } from "./module.ts";

/** What the browser receives for one module section: plain JSON Schema and the field labels. */
export type ConfigurationForm = {
  readonly schema: ConfigFormSchema;
  readonly fields: readonly ConfigFormField[];
};

/** A module's stored configuration read as field values; a value no kind can hold is dropped. */
export const storedConfiguration = z
  .record(z.string(), configValueSchema.catch(undefined))
  .catch({});

/**
 * Converts a module's zod configuration to the JSON Schema ConfigForm renders, with the declared
 * titles merged in schema order (R-75). A missing title falls back to the key.
 */
export function configurationForm(
  configuration: ModuleConfiguration
): ConfigurationForm {
  const emitted = z.toJSONSchema(configuration.schema, {
    io: "input",
    unrepresentable: "throw",
  });

  // SAFETY: validateModule refuses any field outside the five kinds of DEC-28 at build, so the
  // emitted properties are exactly the JSON Schema subset ConfigFieldSchema describes.
  const properties = (emitted.properties ??
    {}) as ConfigFormSchema["properties"];

  const fields = Object.keys(properties).map((id): ConfigFormField => {
    const declared = configuration.fields[id];
    const title = declared?.title ?? id;

    return declared?.description === undefined
      ? { id, title }
      : { id, title, description: declared.description };
  });

  // A field with a default or `.optional()` is absent from `required`, so it may be left empty.
  const required = emitted.required ?? [];

  return {
    schema:
      required.length === 0
        ? { type: "object", properties }
        : { type: "object", properties, required },
    fields,
  };
}

/** One value per field: the stored one, or the JSON Schema default when the key is missing. */
export function withDefaults(
  form: ConfigurationForm,
  stored: Readonly<Record<string, ConfigValue>>
): Record<string, ConfigValue> {
  return Object.fromEntries(
    form.fields.map((field) => [
      field.id,
      field.id in stored
        ? stored[field.id]
        : form.schema.properties[field.id]?.default,
    ])
  );
}

/** One issue per failing field, with the same fixed message the form shows (R-80). */
export function configurationIssues(
  form: ConfigurationForm,
  values: Readonly<Record<string, ConfigValue>>
): readonly AppErrorIssue[] {
  return form.fields.flatMap((field) => {
    const schema = form.schema.properties[field.id];

    const message =
      schema === undefined
        ? null
        : configFieldMessage(
            schema,
            field,
            values[field.id],
            configFieldOptional(form.schema, field.id)
          );

    return message === null ? [] : [{ path: field.id, message }];
  });
}
