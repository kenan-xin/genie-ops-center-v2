import { compose, HOST_PORT } from "./stack.ts";

async function waitForHealth(deadline: number): Promise<void> {
  const ready = await fetch(`http://127.0.0.1:${HOST_PORT}/api/health`)
    .then((response) => response.status === 200)
    .catch(() => false);

  if (ready) return;

  if (Date.now() >= deadline) {
    throw new Error("The setup-gate E2E app did not become ready.");
  }

  await new Promise((settle) => setTimeout(settle, 500));

  return waitForHealth(deadline);
}

export default async function setupGateGlobalSetup(): Promise<void> {
  if (process.env.GENIE_E2E_EXTERNAL === "1") {
    throw new Error(
      "The setup-gate E2E requires its own fresh compose database; external deployments are not supported."
    );
  }

  // The gate acceptance run owns a fresh, incomplete database; unlike other E2E
  // projects it must not use the ordinary working-app fixture seed.
  await compose(["down", "-v"]).catch(() => undefined);
  await compose(["up", "-d", "--wait"]);
  await waitForHealth(Date.now() + 120000);
}
