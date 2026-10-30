import { agentAccess, type ModuleRequestContext } from "@genie/core";
import type { ReactNode } from "react";

import { AgentBubbleMount } from "./agent-bubble-mount.tsx";
import { requireContext } from "./context.ts";
import { documentPrincipal } from "./document-session.ts";

/**
 * The bubble on every signed-in shell page (R-42, P6). It renders only for a person who holds
 * `core:ask:use` while AI is on, and it renders nothing for the break-glass account (P7), the
 * account the agent's `can()` and `scopesFor()` calls do not hold.
 */
export async function AgentBubble(): Promise<ReactNode> {
  const ctx: ModuleRequestContext = {
    tenant: requireContext().tenant,
    caller: await documentPrincipal(),
  };

  const access = await agentAccess(ctx);

  if (!access.permitted || access.ai !== "on") return null;

  const branding = await ctx.tenant.branding.get();

  return (
    <AgentBubbleMount
      models={{
        allowed: access.allowedModels,
        chatDefault: access.chatModel,
      }}
      inbox={access.inbox}
      timeZone={branding.defaultTimeZone}
    />
  );
}
