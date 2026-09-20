import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyProject } from "../classify-project.ts";
import { moduleProjectNamingError } from "../module-naming.ts";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

type NxProject = { readonly root: string; readonly tags?: readonly string[] };

interface NxProjectGraph {
  [name: string]: NxProject;
}

function readProjectGraph(): NxProjectGraph {
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

  const projects: NxProjectGraph = {};

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
    projects[name] = JSON.parse(detail) as NxProject;
  }

  return projects;
}

const projects = readProjectGraph();

describe("repository hygiene", () => {
  it("computes the real workspace root", () => {
    expect(existsSync(join(WORKSPACE_ROOT, "pnpm-workspace.yaml"))).toBe(true);
  });

  it("finds every workspace project", () => {
    expect(Object.keys(projects).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(projects))(
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
    Object.entries(projects).filter(
      ([, project]) => classifyProject(project.root) === "module"
    )
  )("%s obeys the module package naming contract", (name, project) => {
    expect(
      moduleProjectNamingError(project.root, WORKSPACE_ROOT)
    ).toBeUndefined();

    expect(name).toBe(`@genie/module-${project.root.split("/").at(-1)}`);
  });

  it.each(Object.entries(projects))(
    "%s holds a README.md that says what it imports",
    (_name, project) => {
      const readme = join(WORKSPACE_ROOT, project.root, "README.md");

      expect(existsSync(readme)).toBe(true);

      expect(readFileSync(readme, "utf8")).toMatch(/what it imports/i);
    }
  );
});
