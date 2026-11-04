import {
  type AgentAccess,
  chatLabels,
  type ModuleRequestContext,
} from "@genie/core";
import { AgentPanelHost } from "@genie/core/features/agent/panel";
import type { ReactNode } from "react";

/**
 * The agent panel's props on every signed-in shell page (R-42). The shell frame renders it only for
 * a person who holds `core:ask:use` while AI is on, never for the break-glass account (P7).
 */
export async function AgentPanelGate(props: {
  readonly ctx: ModuleRequestContext;
  readonly access: Extract<AgentAccess, { readonly permitted: true }>;
}): Promise<ReactNode> {
  const { ctx, access } = props;

  const [branding, chat] = await Promise.all([
    ctx.tenant.branding.get(),
    chatLabels(ctx),
  ]);

  return (
    <AgentPanelHost
      person={ctx.caller.userId}
      // Only a person who manages the settings picks the model (design review 7.1).
      models={
        access.canPickModel
          ? { allowed: access.allowedModels, chatDefault: access.chatModel }
          : null
      }
      labels={chat.labels}
      suggestions={chat.suggestions}
      inbox={access.inbox}
      timeZone={branding.defaultTimeZone}
    />
  );
}
