import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll } from "vitest";

export const WORKSPACE_ROOT = join(import.meta.dirname, "../../../..");

export type ProbeFile = { readonly path: string; readonly source: string };

export type ProbeResult = {
  readonly failed: boolean;
  readonly output: string;
  readonly root: string;
};

const roots: string[] = [];

// The fixture must outlive probe(): the calling test reads report files out of
// result.root after the command has finished. Cleanup therefore runs when this
// process exits, never inside probe(). Vitest terminates passing workers without
// firing "exit", so this module also self-registers an afterAll hook on import;
// no caller needs to remember cleanup. A hard kill (SIGKILL, out-of-memory) runs
// neither path, and the operating system's temporary-folder reaping is the backstop.
afterAll(() => {
  cleanUpProbeRoots();
});

process.on("exit", () => {
  cleanUpProbeRoots();
});

/**
 * Writes files into a private fixture outside the repository, then runs one command there.
 * The fixture borrows the workspace node_modules through a symlink, so binaries and package
 * specifiers resolve. Nothing is planted inside a real package, so a concurrent target never
 * discovers a deliberate failure.
 */
export function probe(
  files: readonly ProbeFile[],
  command: string,
  args: readonly string[]
): ProbeResult {
  const root = mkdtempSync(join(tmpdir(), "genie-target-probe-"));

  roots.push(root);

  symlinkSync(
    join(WORKSPACE_ROOT, "node_modules"),
    join(root, "node_modules"),
    "dir"
  );

  for (const file of files) {
    const absolute = join(root, file.path);

    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, file.source, "utf8");
  }

  try {
    const output = execFileSync(command, [...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    return { failed: false, output, root };
  } catch (error) {
    // SAFETY: execFileSync throws an Error that also carries stdout and stderr. Only those
    // two fields are read, so this narrow shape holds for every failure this call raises.
    const failure = error as { stdout?: string; stderr?: string };

    return {
      failed: true,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
      root,
    };
  }
}

/** Removes every fixture this module created. Safe to call more than once. */
function cleanUpProbeRoots(): void {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}
