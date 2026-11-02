import type { DocumentInbox } from "../../../contracts/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import { can } from "../authorization/index.ts";
import { ASK_PERMISSION } from "../authorization/roles.ts";
import { type AiState, modelStatus } from "../models/index.ts";
import { type ChatLabels, chatLabels } from "./labels.ts";

/** Only a person who manages the settings picks the chat's model (design review 7.1). */
const MODEL_PICK_PERMISSION = "core:settings:manage";

export type InboxLink = { readonly label: string; readonly href: string };

export type AgentAccess =
  | { readonly permitted: false }
  | {
      readonly permitted: true;
      readonly ai: AiState;
      readonly allowedModels: readonly string[];
      readonly chatModel: string | null;
      /** Whether the chat shows the model picker. */
      readonly canPickModel: boolean;
      readonly inbox: readonly InboxLink[];
    };

/** Whether a chat beside a module page can run: `none` for a person who cannot ask. */
export type ChatAvailability =
  | {
      readonly kind: "on";
      /** null for a person who may not pick the model, so the chat hides the picker (7.1). */
      readonly models: {
        readonly allowed: readonly string[];
        readonly chatDefault: string | null;
      } | null;
      readonly labels: ChatLabels;
      readonly suggestions: readonly string[];
    }
  | { readonly kind: "off" }
  | { readonly kind: "none" };

/**
 * Permitted: a signed-in person who holds `core:ask:use` and is not the break-glass account (P7),
 * because the agent must run under `can()` and `scopesFor()` and that account bypasses both. The
 * inbox holds one link per enabled `document-inbox` provider whose key the person holds (R-42).
 */
export async function agentAccess(
  ctx: ModuleRequestContext
): Promise<AgentAccess> {
  if (
    !(await can(ctx.caller, ASK_PERMISSION)) ||
    (await ctx.caller.grants()).bypass === true
  ) {
    return { permitted: false };
  }

  const [status, providers, canPickModel] = await Promise.all([
    modelStatus(ctx.tenant),
    ctx.tenant.capabilities.list("document-inbox"),
    can(ctx.caller, MODEL_PICK_PERMISSION),
  ]);

  // SAFETY: validateModule checked each document-inbox provision against DocumentInbox before the
  // registry took it, and `list` answers only providers of that name.
  const inboxes = providers.map(
    ({ implementation }) => implementation as DocumentInbox
  );

  const allowed = await Promise.all(
    inboxes.map((inbox) => can(ctx.caller, inbox.permission))
  );

  return {
    permitted: true,
    ai: status.state,
    allowedModels: status.allowedModels,
    chatModel: status.chatModel,
    canPickModel,
    inbox: inboxes
      .filter((_, index) => allowed[index])
      .map(({ label, path }) => ({ label, href: path })),
  };
}

/** The chat beside a module page: only for a person who may ask, and off while models are off. */
export async function chatAvailability(
  ctx: ModuleRequestContext
): Promise<ChatAvailability> {
  const access = await agentAccess(ctx);

  if (!access.permitted) return { kind: "none" };

  if (access.ai !== "on") return { kind: "off" };

  return {
    kind: "on",
    models: access.canPickModel
      ? { allowed: access.allowedModels, chatDefault: access.chatModel }
      : null,
    ...(await chatLabels(ctx)),
  };
}
