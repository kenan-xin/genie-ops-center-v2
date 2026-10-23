import { describe, expect, it } from "vitest";

import { resolveSettingsTarget } from "./settings-target.ts";

const sections = ["sign-in", "sessions", "placeholder"];

const fieldsOf = (sectionId: string) =>
  sectionId === "sessions" ? ["sessionIdleMinutes"] : ["title", "pageSize"];

describe("resolveSettingsTarget (R-72, AC-19)", () => {
  it("opens a known section at a known field", () => {
    expect(
      resolveSettingsTarget(sections, fieldsOf, {
        section: "placeholder",
        field: "pageSize",
      })
    ).toEqual({ sectionId: "placeholder", fieldId: "pageSize", stale: false });
  });

  it("opens the first section and marks the link stale for an unknown or forbidden section", () => {
    expect(
      resolveSettingsTarget(sections, fieldsOf, {
        section: "hidden",
        field: "x",
      })
    ).toEqual({
      sectionId: "sign-in",
      fieldId: null,
      stale: true,
    });
  });

  it("opens a known section without a field when the field is unknown", () => {
    expect(
      resolveSettingsTarget(sections, fieldsOf, {
        section: "sessions",
        field: "retired",
      })
    ).toEqual({ sectionId: "sessions", fieldId: null, stale: false });
  });

  it("opens the first section without a stale note when the link names nothing", () => {
    expect(resolveSettingsTarget(sections, fieldsOf, {})).toEqual({
      sectionId: "sign-in",
      fieldId: null,
      stale: false,
    });
  });
});
