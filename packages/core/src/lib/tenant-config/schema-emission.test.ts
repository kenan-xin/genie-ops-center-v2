import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { brandingSeedSchema } from "./branding-seed.ts";
import { tenantYamlSchema } from "./tenant-yaml.ts";

const SCHEMA_DIRECTORY = resolve(
  import.meta.dirname,
  "../../../../../deploy/schemas"
);

function committedSchema(file: string): string {
  return readFileSync(resolve(SCHEMA_DIRECTORY, file), "utf8");
}

describe("committed tenant configuration schemas", () => {
  it("matches the emitted tenant.yaml schema and rejects additional properties", () => {
    const emitted = z.toJSONSchema(tenantYamlSchema, {
      unrepresentable: "any",
    });

    const committed = JSON.parse(committedSchema("tenant.schema.json"));

    expect(emitted).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(committed).toEqual(emitted);
  });

  it("matches the emitted branding.seed.json schema and rejects additional properties", () => {
    const emitted = z.toJSONSchema(brandingSeedSchema, {
      unrepresentable: "any",
    });

    const committed = JSON.parse(committedSchema("branding.seed.schema.json"));

    expect(emitted).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(committed).toEqual(emitted);
  });
});
