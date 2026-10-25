import { describe, expect, it } from "vitest";

import {
  configFieldChoices,
  configFieldKind,
  configFieldMessage,
  configFormValidator,
  type ConfigFormField,
  type ConfigFormSchema,
  type ConfigValue,
} from "./config-form-schema.ts";

// The placeholder module's configuration as `z.toJSONSchema(..., { io: "input" })` emits it.
const schema = {
  type: "object",
  properties: {
    title: {
      type: "string",
      minLength: 1,
      maxLength: 60,
      pattern: "^[A-Za-z ]+$",
    },
    pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    enabled: { type: "boolean", default: false },
    mode: { type: "string", enum: ["basic", "advanced"], default: "basic" },
    tags: {
      type: "array",
      items: { type: "string", pattern: "^[a-z0-9-]+$" },
      maxItems: 5,
    },
  },
} as const satisfies ConfigFormSchema;

const fields: readonly ConfigFormField[] = [
  { id: "title", title: "Title" },
  { id: "pageSize", title: "Page size" },
  { id: "enabled", title: "Enabled" },
  { id: "mode", title: "Mode" },
  { id: "tags", title: "Tags" },
];

function message(
  id: keyof typeof schema.properties,
  value: ConfigValue
): string | null {
  const meta = fields.find((field) => field.id === id);

  if (meta === undefined) throw new Error(`no field ${id}`);

  return configFieldMessage(schema.properties[id], meta, value);
}

describe("configFieldKind", () => {
  it("maps each JSON Schema shape to one of the five kinds", () => {
    expect(Object.values(schema.properties).map(configFieldKind)).toEqual([
      "string",
      "number",
      "boolean",
      "enum",
      "stringList",
    ]);
  });
});

describe("configFieldMessage gives the fixed R-80 text", () => {
  it("string: required, too long, wrong format", () => {
    expect(message("title", "")).toBe("Title is required.");
    expect(message("title", "a".repeat(61))).toBe(
      "Keep title to 60 characters."
    );
    expect(message("title", "a".repeat(60))).toBeNull();
    expect(message("title", "Bad1")).toBe("Title has the wrong format.");
  });

  it("number: empty, not whole, below and above the range", () => {
    expect(message("pageSize", undefined)).toBe("Page size is required.");
    expect(message("pageSize", Number.NaN)).toBe("Page size is required.");
    expect(message("pageSize", 1.5)).toBe("Page size must be a whole number.");
    expect(message("pageSize", 0)).toBe("Page size must be at least 1.");
    expect(message("pageSize", 101)).toBe("Page size must be at most 100.");
    expect(message("pageSize", 100)).toBeNull();
  });

  it("formats large limits with en-GB grouping", () => {
    const big = { type: "number", maximum: 10000 } as const;
    expect(configFieldMessage(big, { id: "n", title: "Limit" }, 10001)).toBe(
      "Limit must be at most 10,000."
    );
  });

  it("boolean: anything but true or false", () => {
    expect(message("enabled", "yes")).toBe("Choose on or off.");
    expect(message("enabled", true)).toBeNull();
  });

  it("enum: a value outside the options", () => {
    expect(message("mode", "other")).toBe("Choose a value for mode.");
    expect(message("mode", "advanced")).toBeNull();
  });

  it("string list: too many entries, then the first bad entry by position", () => {
    expect(message("tags", ["a", "b", "c", "d", "e", "f"])).toBe(
      "At most 5 entries."
    );
    expect(message("tags", ["good", "Bad Tag"])).toBe("Entry 2: wrong format.");
    expect(message("tags", [])).toBeNull();
  });
});

describe("labeled enum (U-4)", () => {
  const labeled = {
    anyOf: [
      { type: "string", const: "basic", title: "Basic" },
      { type: "string", const: "advanced" },
    ],
    default: "basic",
  } as const;

  it("is an enum whose choices show the title, or the raw value without one", () => {
    expect(configFieldKind(labeled)).toBe("enum");
    expect(configFieldChoices(labeled)).toEqual([
      { value: "basic", label: "Basic" },
      { value: "advanced", label: "advanced" },
    ]);
  });

  it("accepts only a declared value", () => {
    const meta = { id: "mode", title: "Mode" };

    expect(configFieldMessage(labeled, meta, "Basic")).toBe(
      "Choose a value for mode."
    );
    expect(configFieldMessage(labeled, meta, "advanced")).toBeNull();
  });
});

describe("configFormValidator", () => {
  it("reports each failing field under its own id as a Standard Schema issue", async () => {
    const result = await configFormValidator(schema, fields)[
      "~standard"
    ].validate({
      title: "Placeholder",
      pageSize: 500,
      enabled: false,
      mode: "other",
      tags: [],
    });

    expect("issues" in result && result.issues).toEqual([
      expect.objectContaining({
        path: ["pageSize"],
        message: "Page size must be at most 100.",
      }),
      expect.objectContaining({
        path: ["mode"],
        message: "Choose a value for mode.",
      }),
    ]);
  });

  it("accepts a valid value set", async () => {
    const result = await configFormValidator(schema, fields)[
      "~standard"
    ].validate({
      title: "Placeholder",
      pageSize: 20,
      enabled: true,
      mode: "basic",
      tags: ["one", "two-2"],
    });

    expect(result).not.toHaveProperty("issues");
  });
});
