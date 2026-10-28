import { isLimitedBreakGlass } from "@genie/core";
import { headers } from "next/headers.js";
import type { ReactNode } from "react";

import { documentSessionState } from "../../document-session.ts";
import { NoAccessMain } from "../../page-access.tsx";
import { PATHNAME_HEADER } from "../../pathname-header.ts";
import { ShellFrame } from "../../shell-frame.tsx";

/**
 * A switched-off module's page (R-8): the no-access state, inside the shell for a signed-in
 * person. It reads the session without `requireSession()`, because a redirect is not the refusal:
 * a signed-out visitor, an idle session and a limited break-glass session get the state alone,
 * still at 403. Break-glass stays in the admin chrome (U-3).
 */
export default async function ModuleDisabled(): Promise<ReactNode> {
  const state = await documentSessionState();
  const refusal = <NoAccessMain testId="module-disabled" />;

  if (
    state.status !== "authenticated" ||
    isLimitedBreakGlass(state.session.user)
  ) {
    return refusal;
  }

  const pathname = (await headers()).get(PATHNAME_HEADER) ?? "/";

  const chrome =
    state.session.user.isBreakGlass || pathname.startsWith("/admin")
      ? "admin"
      : "workspace";

  return <ShellFrame chrome={chrome}>{refusal}</ShellFrame>;
}
