import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every workspace project holds a README.md that says what it imports
 * (repository layout rule, README R-9). A pure function, so the hygiene suite
 * runs it over the real projects and its own suite proves the failure path
 * against a disposable project.
 *
 * Returns one sentence naming the problem, or `undefined` when the README holds.
 */
export function projectReadmeError(
  projectRoot: string,
  workspaceRoot: string
): string | undefined {
  const readme = join(workspaceRoot, projectRoot, "README.md");

  if (!existsSync(readme)) {
    return `${projectRoot} holds no README.md`;
  }

  if (!/what it imports/i.test(readFileSync(readme, "utf8"))) {
    return `${projectRoot}/README.md does not say what it imports`;
  }

  return undefined;
}
