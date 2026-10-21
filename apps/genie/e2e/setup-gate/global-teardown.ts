import { stopIdentityStandins } from "../../testing/identity-standins-process.ts";
import { compose } from "./stack.ts";

export default async function setupGateGlobalTeardown(): Promise<void> {
  await compose(["down", "-v"]).catch(() => undefined);
  await stopIdentityStandins();
}
