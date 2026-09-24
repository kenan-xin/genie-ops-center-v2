import { compose } from "./stack.ts";

export default async function setupGateGlobalTeardown(): Promise<void> {
  await compose(["down", "-v"]).catch(() => undefined);
}
