import { worktreeId } from "./worktree-scope.ts";

export { WORKSPACE_ROOT } from "./worktree-scope.ts";

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

/** The fixture image the browser gate builds and drives. */
export const FIXTURE_IMAGE = testImageTag("genie-s005", "fixture");

/**
 * The fixed tag the compose stack defaults to (`${GENIE_IMAGE:-genie-s005:test}`).
 * `build-image` applies it as well as the scoped tag, so the browser paths keep
 * resolving while the integration suite gets its own namespace.
 */
export const COMPOSE_IMAGE = "genie-s005:test";
