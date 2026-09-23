import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyProject } from "../classify-project.ts";
import { moduleProjectNamingError } from "../module-naming.ts";
import { moduleTestsError } from "../module-tests.ts";
import { projectReadmeError } from "../project-readme.ts";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

/**
 * The active canonical documentation, by location: the requirement specs, the
 * architecture and core decision docs, the runbooks, the S0-08 ticket, and the
 * root agent guidance plus the two generator-related READMEs. Historical
 * records stay out — the ticket audits and handoffs, `docs/design/history`,
 * `plans` and the transcript exports — so they keep their original spelling.
 */
const CANONICAL_DOC_DIRECTORIES = [
  "docs/specs",
  "docs/architecture",
  "docs/core",
  "docs/runbooks",
  "docs/tickets/spec-0/08-module-and-tenant-generators",
] as const;

const CANONICAL_DOC_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
  "packages/modules/README.md",
  "tools/generators/README.md",
] as const;

/**
 * The superseded generator collection specifiers. The canonical commands are
 * `nx g @genie/generators:module-new <capability>` and
 * `nx g @genie/generators:tenant-new <slug>`: one collection in
 * `@genie/generators`, never `@genie/module` or `@genie/tenant`. Matching the
 * collection specifier rather than the full command also catches a bare
 * `` `@genie/module:new` `` reference.
 */
const SUPERSEDED_GENERATOR_SPECIFIERS = [
  "@genie/module:new",
  "@genie/tenant:new",
] as const;

/**
 * Every active canonical markdown document, as repository-relative paths. Only
 * the top level of each directory is read, so the `*.md` validate inputs cover
 * exactly these files.
 */
function canonicalDocPaths(): readonly string[] {
  const paths: string[] = [...CANONICAL_DOC_FILES];

  for (const directory of CANONICAL_DOC_DIRECTORIES) {
    for (const entry of readdirSync(join(WORKSPACE_ROOT, directory), {
      withFileTypes: true,
    })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        paths.push(join(directory, entry.name));
      }
    }
  }

  return paths.toSorted();
}

type NxTarget = { readonly cache?: boolean };

type NxProject = {
  readonly root: string;
  readonly tags?: readonly string[];
  readonly targets?: Readonly<Record<string, NxTarget>>;
};

function readProjectGraph(): ReadonlyMap<string, NxProject> {
  const raw = execFileSync(
    "pnpm",
    ["exec", "nx", "show", "projects", "--json", "--verbose"],
    {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
    }
  );

  // SAFETY: `nx show projects --json` prints one JSON array of project names, and
  // this test fails loudly if that contract changes.
  const names = JSON.parse(raw) as readonly string[];

  const projects = new Map<string, NxProject>();

  for (const name of names) {
    const detail = execFileSync(
      "pnpm",
      ["exec", "nx", "show", "project", name, "--json"],
      {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
      }
    );

    // SAFETY: same provenance as `names`, this time the one-project document whose
    // fields the assertions below read directly.
    projects.set(name, JSON.parse(detail) as NxProject);
  }

  return projects;
}

const projects = readProjectGraph();

describe("repository hygiene", () => {
  it("computes the real workspace root", () => {
    expect(existsSync(join(WORKSPACE_ROOT, "pnpm-workspace.yaml"))).toBe(true);
  });

  it("finds every workspace project", () => {
    expect(projects.size).toBeGreaterThan(0);
  });

  // A real-database integration run proves mandatory execution through its
  // runner, so a cache hit would replay that proof instead of re-establishing
  // it. Every project that declares the target keeps it uncached; no database
  // target is special-cased (bead genie-ops-center-v2-7lj).
  it.each(
    [...projects].filter(([, project]) => project.targets?.["test:integration"])
  )("%s keeps test:integration uncached", (_name, project) => {
    expect(project.targets?.["test:integration"]?.cache).toBe(false);
  });

  it.each([...projects])(
    "%s carries exactly its derived classification tag",
    (_name, project) => {
      const expected = classifyProject(project.root);

      const classifications = (project.tags ?? []).filter((tag) =>
        ["app", "core", "ui", "module", "config", "tooling"].includes(tag)
      );

      expect(classifications).toEqual([expected]);
    }
  );

  // The production check, over whatever modules the workspace really holds. It
  // generates no case until the first module lands, which is why the same
  // function is proved against a disposable workspace in module-naming.test.ts.
  it.each(
    [...projects].filter(
      ([, project]) => classifyProject(project.root) === "module"
    )
  )("%s obeys the module package naming contract", (name, project) => {
    expect(
      moduleProjectNamingError(project.root, WORKSPACE_ROOT)
    ).toBeUndefined();

    expect(name).toBe(`@genie/module-${project.root.split("/").at(-1)}`);
  });

  // R-41: a module package that ships no test must fail continuous integration,
  // not just report a green empty run. Runs over whatever modules exist; the
  // failure path itself is proved in module-tests.test.ts.
  it.each(
    [...projects].filter(
      ([, project]) => classifyProject(project.root) === "module"
    )
  )("%s ships at least one test file", (_name, project) => {
    expect(moduleTestsError(project.root, WORKSPACE_ROOT)).toBeUndefined();
  });

  it.each([...projects])(
    "%s holds a README.md that says what it imports",
    (_name, project) => {
      // The failure path is proved in project-readme.test.ts.
      expect(projectReadmeError(project.root, WORKSPACE_ROOT)).toBeUndefined();
    }
  );

  // The single collection is `@genie/generators`; `@genie/module:new` and
  // `@genie/tenant:new` were superseded before S0-08 implemented them, so no
  // active canonical document may advertise them. Historical evidence is
  // outside `canonicalDocPaths`, which is why only the active set is read.
  it("advertises no superseded generator collection in the active canonical docs", () => {
    const offenders = canonicalDocPaths().flatMap((path) => {
      const contents = readFileSync(join(WORKSPACE_ROOT, path), "utf8");

      return SUPERSEDED_GENERATOR_SPECIFIERS.flatMap((specifier) =>
        contents.includes(specifier) ? [`${path}: ${specifier}`] : []
      );
    });

    expect(offenders).toEqual([]);
  });
});
