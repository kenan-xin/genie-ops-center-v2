import { readSetupProgress } from "@genie/core";

import { requireContext } from "../../context.ts";
import { NotSetUpPage } from "../../setup/not-set-up-page.tsx";

export const dynamic = "force-dynamic";

/**
 * The one document the setup gate rewrites to while the deployment is not set up (R-16, D-2). The
 * proxy owns the decision and this route only renders it, so every route shows the same page with
 * the same database read the proxy just performed. It reads the steps directly, not through the
 * gate's latch, so the page always lists the current state.
 */
export default async function SetupRequiredPage() {
  const { tenant } = requireContext();
  const steps = await readSetupProgress(tenant);

  return <NotSetUpPage steps={steps} />;
}
