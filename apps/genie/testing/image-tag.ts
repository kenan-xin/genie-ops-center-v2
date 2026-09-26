import { createHash } from "node:crypto";
import { resolve } from "node:path";

/**
 * The repository root, which holds the Dockerfile and the context every test
 * image is built from.
 */
export const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");

/**
 * A short, stable id for this working tree.
 *
 * Every worktree used to build and run the same fixed tags (`genie-s005:test`
 * among them), so when two ran at once one branch's build replaced the tag under
 * the other's running tests — the freshness-guard failures and the unexplained
 * 503s the ticket records. Hashing the absolute workspace path gives each
 * worktree its own tag namespace, while staying stable across runs in one
 * worktree so Docker's BuildKit cache and the image-freshness guard still reuse
 * the same image. `GENIE_WORKTREE_ID` overrides it for a caller that wants a
 * different scope.
 */
export function worktreeId(): string {
  const explicit = process.env.GENIE_WORKTREE_ID?.trim();

  if (explicit !== undefined && explicit !== "") {
    return explicit.replaceAll(/[^A-Za-z0-9_.-]/g, "-");
  }

  return createHash("sha256").update(WORKSPACE_ROOT).digest("hex").slice(0, 12);
}

/** A `repository:tag` pair scoped to this working tree. */
export function testImageTag(repository: string, tag: string): string {
  return `${repository}:${tag}-${worktreeId()}`;
}

/**
 * The image every app integration test drives. Scoped to this working tree so
 * two worktrees never build or rebuild the same tag under each other's tests
 * (the `genie-s005:test` freshness-guard failures the ticket records).
 */
export const IMAGE = testImageTag("genie-s005", "test");

/**
 * The fixed tag the compose stack and the Playwright fixtures default to
 * (`${GENIE_IMAGE:-genie-s005:test}`). `build-image` applies it as well as the
 * scoped one, so the browser paths stay untouched while the integration suite
 * gets its own namespace.
 */
export const COMPOSE_IMAGE = "genie-s005:test";
