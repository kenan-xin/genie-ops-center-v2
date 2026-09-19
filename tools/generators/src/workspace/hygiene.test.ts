import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyProject } from "./classify-project.ts";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../..");

type NxProject = { readonly root: string; readonly tags?: readonly string[] };

function readProjectGraph(): Record<string, NxProject> {
  const raw = execFileSync("pnpm", ["exec", "nx", "show", "projects", "--json", "--verbose"], {
    cwd: WORKSPACE_ROOT,
    encoding: "utf8",
  });
  const names = JSON.parse(raw) as readonly string[];

  const projects: Record<string, NxProject> = {};
  for (const name of names) {
    const detail = execFileSync("pnpm", ["exec", "nx", "show", "project", name, "--json"], {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
    });
    projects[name] = JSON.parse(detail) as NxProject;
  }
  return projects;
}

const projects = readProjectGraph();

describe("repository hygiene", () => {
  it("finds every workspace project", () => {
    expect(Object.keys(projects).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(projects))("%s carries exactly its derived classification tag", (_name, project) => {
    const expected = classifyProject(project.root);
    const classifications = (project.tags ?? []).filter((tag) =>
      ["app", "core", "ui", "module", "config", "tooling"].includes(tag),
    );
    expect(classifications).toEqual([expected]);
  });

  it.each(Object.entries(projects))("%s holds a README.md that says what it imports", (_name, project) => {
    const readme = join(WORKSPACE_ROOT, project.root, "README.md");
    expect(existsSync(readme)).toBe(true);
    expect(readFileSync(readme, "utf8")).toMatch(/what it imports/i);
  });
});
