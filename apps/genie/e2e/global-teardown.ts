import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { stopIdentityStandins } from "../testing/identity-standins-process.ts";
import { COMPOSE, LOCAL_COMPOSE } from "./global-setup.ts";
import { stopBrokered } from "./support/brokered.ts";
import { stopClientOnly } from "./support/client-only.ts";

const run = promisify(execFile);

export default async function globalTeardown(): Promise<void> {
  if (process.env.GENIE_E2E_EXTERNAL === "1") return;

  // The brokered and client-only containers are `docker compose run` instances, which `down`
  // does not remove; stop them first.
  await stopBrokered("oidc");
  await stopBrokered("saml");
  await stopClientOnly();

  // The fixed project name makes this work whether or not the two hooks shared
  // a process, and whatever the previous run left behind.
  await run("docker", [...COMPOSE, "down", "-v"]).catch(() => undefined);
  await run("docker", [...LOCAL_COMPOSE, "down", "-v"]).catch(() => undefined);
  await stopIdentityStandins();
}
