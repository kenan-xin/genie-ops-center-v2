import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

const SCREENS = [
  "people/people-screen.tsx",
  "groups/groups-screen.tsx",
  "roles/roles-screen.tsx",
  "audit/audit-log.tsx",
  "audit/audit-event-sheet.tsx",
  "account/account-page.tsx",
  "break-glass/break-glass-sign-in.tsx",
  "break-glass/break-glass-account.tsx",
] as const;

const KIT_NAMES = [
  "focusRing",
  "btnPrimary",
  "btnSecondary",
  "btnDanger",
  "btnGhost",
  "inputClass",
  "filterLabel",
];

it("takes the primitives of every screen that used a core kit from @genie/ui (AC-3)", () => {
  for (const screen of SCREENS) {
    const source = readFileSync(join(import.meta.dirname, screen), "utf8");

    expect(source, screen).toMatch(/from "@genie\/ui"/);
    expect(source, screen).not.toMatch(
      /\bconst (btn[A-Z]\w*|inputClass|primaryClass|labelClass|linkClass)\b/
    );
  }
});

it("leaves no core kit behind (R-19a)", async () => {
  expect(existsSync(join(import.meta.dirname, "admin/ui.tsx"))).toBe(false);

  const helpers = await import("./audit/helpers.ts");

  for (const name of KIT_NAMES)
    expect(Object.keys(helpers)).not.toContain(name);
});
