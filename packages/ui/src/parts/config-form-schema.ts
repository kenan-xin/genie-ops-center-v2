import { z } from "zod";

/**
 * The JSON Schema subset of one ConfigForm field: what `z.toJSONSchema(..., { io: "input" })`
 * emits for the five field kinds of DEC-28, and nothing else. No React here, so core can import
 * the messages on the server and both sides show one text (R-80).
 */
export type ConfigFieldSchema =
  | {
      readonly type: "string";
      readonly enum: readonly string[];
      readonly default?: string;
    }
  | {
      readonly type: "string";
      readonly enum?: undefined;
      readonly minLength?: number;
      readonly maxLength?: number;
      readonly pattern?: string;
      readonly default?: string;
    }
  | {
      readonly type: "number" | "integer";
      readonly minimum?: number;
      readonly maximum?: number;
      readonly default?: number;
    }
  | {
      /** A labeled enum: zod emits a union of titled string literals as `anyOf` (U-4). */
      readonly type?: undefined;
      readonly anyOf: readonly {
        readonly type: "string";
        readonly const: string;
        readonly title?: string;
      }[];
      readonly default?: string;
    }
  | { readonly type: "boolean"; readonly default?: boolean }
  | {
      readonly type: "array";
      readonly items: {
        readonly type: "string";
        readonly pattern?: string;
        readonly maxLength?: number;
      };
      readonly maxItems?: number;
      readonly default?: readonly string[];
    };

export type ConfigFormSchema = {
  readonly type: "object";
  readonly properties: Readonly<Record<string, ConfigFieldSchema>>;
};

/** One field's label and help, in declared order. */
export type ConfigFormField = {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
};

export type ConfigValue =
  | string
  | number
  | boolean
  | readonly string[]
  | undefined;

export type ConfigFieldKind =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "stringList";

export function configFieldKind(field: ConfigFieldSchema): ConfigFieldKind {
  switch (field.type) {
    case undefined:
      return "enum";
    case "string":
      return field.enum === undefined ? "string" : "enum";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "stringList";
  }
}

export type ConfigChoice = { readonly value: string; readonly label: string };

/** An enum field's choices. A labeled choice shows its title, an unlabeled one its raw value. */
export function configFieldChoices(
  field: ConfigFieldSchema
): readonly ConfigChoice[] {
  if (field.type === undefined)
    return field.anyOf.map((option) => ({
      value: option.const,
      label: option.title ?? option.const,
    }));

  if (field.type === "string" && field.enum !== undefined)
    return field.enum.map((value) => ({ value, label: value }));

  return [];
}

/** Any value a ConfigForm field holds. Core parses request bodies and stored rows with it. */
export const configValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()).readonly(),
  z.undefined(),
]);

const formatNumber = (n: number): string => n.toLocaleString("en-GB");

/**
 * The zod schema of one field, rebuilt from its JSON Schema with the fixed R-80 messages, so the
 * form accepts exactly what the module's own zod schema accepts on the server. A pattern is
 * rebuilt with no flags because `z.toJSONSchema` drops them and modules declare none (DR-20 S3-06).
 */
function fieldValueSchema(
  field: ConfigFieldSchema,
  meta: ConfigFormField
): z.ZodType {
  const title = meta.title;
  const lower = title.toLowerCase();
  const wrongFormat = `${title} has the wrong format.`;

  const choose = `Choose a value for ${lower}.`;

  const oneOf = (options: readonly string[]) =>
    z
      .string({ error: choose })
      .refine((value) => options.includes(value), { error: choose });

  switch (field.type) {
    case undefined:
      return oneOf(field.anyOf.map((option) => option.const));
    case "boolean":
      return z.boolean({ error: "Choose on or off." });
    case "number":
    case "integer": {
      let number = z.number({ error: `${title} is required.` });

      if (field.type === "integer")
        number = number.int({ error: `${title} must be a whole number.` });

      if (field.minimum !== undefined)
        number = number.min(field.minimum, {
          error: `${title} must be at least ${formatNumber(field.minimum)}.`,
        });

      if (field.maximum !== undefined)
        number = number.max(field.maximum, {
          error: `${title} must be at most ${formatNumber(field.maximum)}.`,
        });

      return number;
    }

    case "array": {
      let item = z.string();

      if (field.items.maxLength !== undefined)
        item = item.max(field.items.maxLength);

      if (field.items.pattern !== undefined)
        item = item.regex(new RegExp(field.items.pattern));

      const list = z.array(item, { error: wrongFormat });

      return field.maxItems === undefined
        ? list
        : list.max(field.maxItems, {
            error: `At most ${formatNumber(field.maxItems)} entries.`,
          });
    }

    case "string": {
      if (field.enum !== undefined) return oneOf(field.enum);

      let text = z.string({ error: wrongFormat });

      if (field.minLength !== undefined)
        text = text.min(field.minLength, { error: `${title} is required.` });

      if (field.maxLength !== undefined)
        text = text.max(field.maxLength, {
          error: `Keep ${lower} to ${formatNumber(field.maxLength)} characters.`,
        });

      if (field.pattern !== undefined)
        text = text.regex(new RegExp(field.pattern), {
          error: wrongFormat,
        });

      return text;
    }
  }
}

/** The fixed R-80 message for one field value, or null when the value is valid. First rule wins. */
export function configFieldMessage(
  field: ConfigFieldSchema,
  meta: ConfigFormField,
  value: ConfigValue
): string | null {
  const result = fieldValueSchema(field, meta).safeParse(value);

  if (result.success) return null;

  const [first] = result.error.issues;
  const entry = first?.path[0];

  // An issue inside a string list carries the entry index as its path.
  return entry === undefined
    ? (first?.message ?? null)
    : `Entry ${Number(entry) + 1}: wrong format.`;
}

/**
 * A Standard Schema validator for TanStack Form, built from the JSON Schema because the browser
 * cannot receive the module's zod object. Each issue's path is the field id.
 */
export function configFormValidator(
  schema: ConfigFormSchema,
  fields: readonly ConfigFormField[]
): z.ZodType<Record<string, ConfigValue>, Record<string, ConfigValue>> {
  return z.custom<Record<string, ConfigValue>>().superRefine((values, ctx) => {
    for (const meta of fields) {
      const field = schema.properties[meta.id];

      if (field === undefined) continue;

      const message = configFieldMessage(field, meta, values[meta.id]);

      if (message !== null)
        ctx.addIssue({ code: "custom", path: [meta.id], message });
    }
  });
}
