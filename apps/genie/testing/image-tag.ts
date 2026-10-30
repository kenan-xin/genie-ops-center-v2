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

/**
 * The `MODULE_INCLUDE` value `IMAGE` is built with. It follows the shell's
 * `${MODULE_INCLUDE-placeholder}` rule: an unset variable selects placeholder,
 * an explicitly empty one selects nothing.
 */
export const IMAGE_MODULE_INCLUDE = process.env.MODULE_INCLUDE ?? "placeholder";

/**
 * The module ids `IMAGE` compiles, so a spec visits only their pages. Split as
 * the release pipeline splits an include list: the boundary rules keep
 * `@genie/generators` out of the app (R-7a), and the image build refuses an
 * unknown id.
 */
export const IMAGE_MODULES: ReadonlySet<string> = new Set(
  IMAGE_MODULE_INCLUDE.split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "")
);

/** The fixture image the browser gate builds and drives. */
export const FIXTURE_IMAGE = testImageTag("genie-s005", "fixture");

/** The fixture modules `FIXTURE_IMAGE` compiles (`tools/fixture-modules/`). */
export const FIXTURE_MODULES = [
  "failing-viewer",
  "invalid-viewer",
  "permitted-viewer",
  "landing-fixture",
  "required-setting",
] as const;

/**
 * The fixed tag the compose stack defaults to (`${GENIE_IMAGE:-genie-s005:test}`).
 * `build-image` applies it as well as the scoped tag, so the browser paths keep
 * resolving while the integration suite gets its own namespace.
 */
export const COMPOSE_IMAGE = "genie-s005:test";
