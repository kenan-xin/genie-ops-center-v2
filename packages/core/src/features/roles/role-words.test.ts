import { expect, it } from "vitest";

import { permissionCountLine } from "./role-words.ts";
import type { RolePermissionGroup } from "./types.ts";

const keys = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    key: `key-${index}`,
    label: `key-${index}`,
    unavailable: false,
  }));

const core = (count: number): RolePermissionGroup => ({
  moduleId: "core",
  moduleName: "Core",
  entitled: true,
  keys: keys(count),
});

const mod = (moduleId: string, count: number): RolePermissionGroup => ({
  moduleId,
  moduleName: moduleId,
  entitled: true,
  keys: keys(count),
});

it("counts the permissions and names Core and the modules they come from", () => {
  expect(
    permissionCountLine([core(7), mod("invoices", 1), mod("slides", 2)])
  ).toBe("10 permissions: Core and 2 modules.");
  expect(permissionCountLine([core(1)])).toBe("1 permission: Core.");
  expect(permissionCountLine([mod("invoices", 3)])).toBe(
    "3 permissions: 1 module."
  );
  expect(permissionCountLine([])).toBe("No permissions.");
});
