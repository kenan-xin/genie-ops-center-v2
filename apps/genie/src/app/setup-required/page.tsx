import { readSetupProgress } from "@genie/core";
import { headers } from "next/headers.js";
import { notFound } from "next/navigation.js";

import { requireContext } from "../../context.ts";
import { SETUP_REQUIRED_HEADER } from "../../setup-required-header.ts";
import { NotSetUpPage } from "../../setup/not-set-up-page.tsx";

export const dynamic = "force-dynamic";

/**
 * The one document the setup gate rewrites to while the deployment is not set up (R-16, D-2). The
 * proxy owns the decision and marks the rewritten request, and this route trusts that mark: the
 * proxy is the only writer of the header and the pass-through strips a client copy, so its absence
 * means a direct call on a set-up deployment rather than the gate's rewrite.
 *
 * Deciding on the header, not a second read, keeps a request that raced setup completion on the
 * not-set-up page instead of turning it into a 404. The read that follows only fills the step list.
 */
export default async function SetupRequiredPage() {
  if ((await headers()).get(SETUP_REQUIRED_HEADER) !== "1") notFound();

  const { tenant } = requireContext();
  const steps = await readSetupProgress(tenant);

  return <NotSetUpPage steps={steps} />;
}
