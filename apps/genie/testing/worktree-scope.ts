import { createHash } from "node:crypto";
import { resolve } from "node:path";

/**
 * The repository root, which holds the Dockerfile and the compose stacks every
 * test image and browser run builds from.
 */
export const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");

/**
 * A short, stable id for this working tree.
 *
 * Every worktree used to build and run the same fixed tags, compose projects and
 * host ports, so when two ran at once one branch's `docker build`, `compose up`
 * or port bind landed on the other's — the image freshness-guard failures, the
 * "container name ... is already in use" conflict and the unexplained 503s the
 * tickets record. Hashing the absolute workspace path gives each worktree its
 * own namespace while staying stable across runs in one worktree, so Docker's
 * BuildKit cache, compose volumes and the image-freshness guard still reuse the
 * same artifacts. `GENIE_WORKTREE_ID` overrides it for a caller that wants a
 * different scope.
 */
export function worktreeId(): string {
  const explicit = process.env.GENIE_WORKTREE_ID?.trim();

  if (explicit !== undefined && explicit !== "") {
    return explicit.replaceAll(/[^A-Za-z0-9_.-]/g, "-");
  }

  return createHash("sha256").update(WORKSPACE_ROOT).digest("hex").slice(0, 12);
}

/**
 * A compose project name scoped to this worktree. Compose derives the container,
 * network and volume names from the project, so scoping the project scopes every
 * derived name with it.
 */
export function scopedProject(base: string): string {
  return `${base}-${worktreeId()}`;
}

/**
 * How far a fixed host port moves aside for this worktree.
 *
 * Ports cannot carry the whole hash, so this is a deterministic offset in
 * `[0, 2000)` derived from one. A caller places each stack in its own band
 * (`base + offset`) far enough apart that the bands never overlap, which keeps
 * the stacks in one worktree apart and makes two worktrees collide only if
 * their offsets are equal (about one in two thousand per pair).
 */
function worktreePortOffset(): number {
  return (
    Number.parseInt(
      createHash("sha256").update(worktreeId()).digest("hex").slice(0, 8),
      16
    ) % 2000
  );
}

/**
 * The ports above 1023 on the Fetch standard's bad-port list. Node's `fetch` refuses them with
 * "bad port", so a stack bound to one never answers a health poll.
 */
const FETCH_BLOCKED_PORTS = new Set([
  1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666,
  6667, 6668, 6669, 6679, 6697, 10080,
]);

/** The fixed host port `base`, moved aside for this worktree and past any port fetch refuses. */
export function scopedPort(base: number): number {
  let port = base + worktreePortOffset();

  while (FETCH_BLOCKED_PORTS.has(port)) port += 1;

  return port;
}
