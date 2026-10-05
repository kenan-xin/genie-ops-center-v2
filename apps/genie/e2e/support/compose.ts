import { scopedProject } from "../../testing/worktree-scope.ts";

/**
 * The compose stack the browser run drives. It lives here rather than in the global setup so a
 * support module can query it without importing the setup (which imports this).
 */
export const COMPOSE_FILE = "deploy/stack/compose.e2e.yaml";

export const COMPOSE = [
  "compose",
  "-p",
  scopedProject("genie-s005-e2e"),
  "-f",
  COMPOSE_FILE,
];
