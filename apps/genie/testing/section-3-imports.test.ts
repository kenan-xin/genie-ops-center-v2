import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { productionSources } from "../src/i18n/catalogue-coverage.ts";

/**
 * Spec 3 AC-19a, R-95: no screen of Section 3 checks a permission outside `can()` or filters a
 * list outside `scopesFor()` (DEC-39). A screen that reads `role_assignment`, imports the
 * `roleAssignment` table, deep-imports the authorization service, or imports any other value it
 * exports fails here. The lint boundaries cover package direction only, so this is the check.
 */
const REPO = join(import.meta.dirname, "../../..");

const SEAMS = new Set(["can", "scopesFor"]);

/** Every value the authorization service exports except the two seams, and the assignment table. */
function permissionHelpers(): ReadonlySet<string> {
  const path = join(REPO, "packages/core/src/services/authorization/index.ts");

  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest
  );

  const names = new Set(["roleAssignment"]);

  for (const statement of source.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements)
        if (!element.isTypeOnly) names.add(element.name.text);
    }

    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined)
      names.add(statement.name.text);
  }

  for (const seam of SEAMS) names.delete(seam);

  return names;
}

function permissionViolations(
  path: string,
  text: string,
  helpers: ReadonlySet<string>
): readonly string[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const violations: string[] = [];

  if (text.includes("role_assignment"))
    violations.push(`${path}: reads role_assignment`);

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;

    const from = statement.moduleSpecifier.text;

    if (from.includes("services/authorization"))
      violations.push(`${path}: imports ${from}`);

    const named = statement.importClause?.namedBindings;

    if (
      statement.importClause?.isTypeOnly ||
      named === undefined ||
      !ts.isNamedImports(named)
    )
      continue;

    for (const element of named.elements) {
      const imported = (element.propertyName ?? element.name).text;

      if (!element.isTypeOnly && helpers.has(imported))
        violations.push(`${path}: imports ${imported} from ${from}`);
    }
  }

  return violations;
}

/** The shell and every Section 3 screen, in core and in the application that composes them. */
const SCREEN_ROOTS = [
  ...["shell", "modules", "categories", "settings", "branding"].map(
    (feature) => `packages/core/src/features/${feature}`
  ),
  ...["modules", "categories", "settings", "branding"].map(
    (route) => `apps/genie/src/app/admin/${route}`
  ),
  "apps/genie/src/app/sign-in",
];

const SCREEN_FILES = [
  "apps/genie/src/shell-frame.tsx",
  "apps/genie/src/shell-model.ts",
];

describe("Section 3 screens reach permissions only through can() and scopesFor() (R-95)", () => {
  const helpers = permissionHelpers();

  it("refuses a planted assignment read and a planted helper import, and passes the seams", () => {
    expect(helpers).toContain("createGrantReader");
    expect(helpers).not.toContain("can");

    expect(
      permissionViolations(
        "screen.tsx",
        `import { can, scopesFor, type RequestPrincipal } from "@genie/core";
import { createGrantReader } from "@genie/core";
import { roleAssignment } from "../../schema.ts";
import { principalFor } from "../../services/authorization/grant-reader.ts";
const sql = "select * from role_assignment";
`,
        helpers
      )
    ).toEqual([
      "screen.tsx: reads role_assignment",
      "screen.tsx: imports createGrantReader from @genie/core",
      "screen.tsx: imports roleAssignment from ../../schema.ts",
      "screen.tsx: imports ../../services/authorization/grant-reader.ts",
      "screen.tsx: imports principalFor from ../../services/authorization/grant-reader.ts",
    ]);
  });

  it("finds no permission check outside the seams in the shell or a Section 3 screen", () => {
    const sources = [
      ...SCREEN_ROOTS.flatMap((root) =>
        productionSources(join(REPO, root)).map((source) => ({
          path: `${root}/${source.path}`,
          text: source.text,
        }))
      ),
      ...SCREEN_FILES.map((path) => ({
        path,
        text: readFileSync(join(REPO, path), "utf8"),
      })),
    ];

    // Every root holds screen files, so an emptied folder cannot pass unread.
    for (const root of SCREEN_ROOTS)
      expect(
        sources.some((source) => source.path.startsWith(`${root}/`)),
        root
      ).toBe(true);

    expect(
      sources.flatMap((source) =>
        permissionViolations(source.path, source.text, helpers)
      )
    ).toEqual([]);
  });
});
