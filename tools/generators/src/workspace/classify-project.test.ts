import { describe, expect, it } from "vitest";

import { classifyProject } from "./classify-project.ts";

describe("classifyProject", () => {
  it.each([
    ["apps/genie", "app"],
    ["apps/storybook", "app"],
    ["customers/acme/app", "app"],
    ["packages/core", "core"],
    ["packages/ui", "ui"],
    ["packages/modules/placeholder", "module"],
    ["packages/config", "config"],
    ["tools/generators", "tooling"],
  ])("classifies %s as %s", (root, expected) => {
    expect(classifyProject(root)).toBe(expected);
  });

  it("refuses a root it does not recognise, so a new folder cannot enter the graph untagged", () => {
    expect(() => classifyProject("packages/mystery")).toThrow(
      /no architectural classification/i
    );
  });

  it("treats packages/modules itself as unclassified, because it holds no code", () => {
    expect(() => classifyProject("packages/modules")).toThrow(
      /no architectural classification/i
    );
  });
});
