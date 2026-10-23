import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  configurationForm,
  configurationIssues,
  storedConfiguration,
  withDefaults,
} from "./configuration-form.ts";
import type { ModuleConfiguration } from "./module.ts";

// The placeholder module's declaration; core may not import a module, so it is repeated here.
const configuration = {
  schema: z.object({
    title: z.string().min(1).max(60).default("Placeholder"),
    pageSize: z.number().int().min(1).max(100).default(20),
    enabled: z.boolean().default(false),
    mode: z.enum(["basic", "advanced"]).default("basic"),
    tags: z
      .array(z.string().regex(/^[a-z0-9-]+$/))
      .max(5)
      .default([]),
  }),
  section: { id: "placeholder", title: "Placeholder" },
  fields: {
    title: { id: "title", title: "Title" },
    pageSize: { id: "pageSize", title: "Page size" },
    enabled: { id: "enabled", title: "Enabled" },
    mode: { id: "mode", title: "Mode" },
  },
} satisfies ModuleConfiguration;

const form = configurationForm(configuration);

describe("configurationForm (AC-10)", () => {
  it("converts the placeholder schema to the five kinds with their constraints", () => {
    expect(form.schema.properties).toEqual({
      title: {
        type: "string",
        minLength: 1,
        maxLength: 60,
        default: "Placeholder",
      },
      pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      enabled: { type: "boolean", default: false },
      mode: { type: "string", enum: ["basic", "advanced"], default: "basic" },
      tags: {
        type: "array",
        items: { type: "string", pattern: "^[a-z0-9-]+$" },
        maxItems: 5,
        default: [],
      },
    });
  });

  it("carries the declared titles in schema order, and the key for a field without one", () => {
    expect(form.fields.map((field) => [field.id, field.title])).toEqual([
      ["title", "Title"],
      ["pageSize", "Page size"],
      ["enabled", "Enabled"],
      ["mode", "Mode"],
      ["tags", "tags"],
    ]);
  });
});

describe("withDefaults", () => {
  it("fills each missing key with its default and keeps a stored value that fails", () => {
    expect(withDefaults(form, {})).toEqual({
      title: "Placeholder",
      pageSize: 20,
      enabled: false,
      mode: "basic",
      tags: [],
    });
    expect(withDefaults(form, { pageSize: 500 })).toMatchObject({
      pageSize: 500,
    });
  });

  it("reads a stored row that is not an object as empty", () => {
    expect(storedConfiguration.parse([1, 2])).toEqual({});
  });

  it("drops a stored value that no field kind can hold", () => {
    const stored = storedConfiguration.parse({
      pageSize: { nested: true },
      stale: 1,
    });

    expect(withDefaults(form, stored)).toEqual({
      title: "Placeholder",
      pageSize: undefined,
      enabled: false,
      mode: "basic",
      tags: [],
    });
  });
});

describe("configurationIssues", () => {
  it("gives the fixed message under the field id", () => {
    expect(
      configurationIssues(form, withDefaults(form, { pageSize: 500 }))
    ).toEqual([
      { path: "pageSize", message: "Page size must be at most 100." },
    ]);
  });

  it("agrees with the module's own zod schema on every value it accepts", () => {
    const values = withDefaults(form, {
      tags: ["a-1", "b"],
      title: "x".repeat(60),
    });

    expect(configuration.schema.safeParse(values).success).toBe(true);
    expect(configurationIssues(form, values)).toEqual([]);
  });
});
