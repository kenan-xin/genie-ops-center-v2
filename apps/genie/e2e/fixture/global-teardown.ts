import { compose } from "./stack.ts";

/** Tears down only this run's own compose project, never the ordinary one. */
export default async function fixtureGlobalTeardown(): Promise<void> {
  await compose(["down", "-v"]).catch(() => undefined);
}
