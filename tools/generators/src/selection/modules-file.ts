import { existsSync, readFileSync } from "node:fs";

/**
 * Reads a customer modules.txt into a MODULE_INCLUDE value.
 * An existing file that lists no module returns "", which is an explicitly empty selection.
 * A missing file throws, so a typo can never widen the selection to every module.
 */
export function readModulesFile(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`The module include file ${path} does not exist.`);
  }

  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(",");
}
