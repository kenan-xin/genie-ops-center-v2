import { readSetupProgress, setupSatisfied } from "@genie/core";
import { notFound } from "next/navigation.js";

import { requireContext } from "../../context.ts";
import { NotSetUpPage } from "../../setup/not-set-up-page.tsx";

export const dynamic = "force-dynamic";

/**
 * The one document the setup gate rewrites to while the deployment is not set up (R-16, D-2). The
 * proxy owns the decision and this route only renders it, so every route shows the same page with
 * the same database read the proxy just performed. It reads the steps directly, not through the
 * gate's latch, so the page always lists the current state.
 *
 * A direct caller after setup gets the framework's not-found: the route is an internal rewrite
 * target, not a public page (finding 5).
 */
export default async function SetupRequiredPage() {
  const { tenant } = requireContext();
  const steps = await readSetupProgress(tenant);

  if (setupSatisfied(steps)) notFound();

  return <NotSetUpPage steps={steps} />;
}
