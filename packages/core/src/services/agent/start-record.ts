import { randomUUID } from "node:crypto";

import type { AgentSurface } from "../../../contracts/index.ts";
import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { can } from "../authorization/index.ts";
import { agentAccess } from "./access.ts";
import { chatTitleFrom } from "./contract.ts";
import { startRun } from "./run-job.ts";
import { insertHandedSession } from "./store.ts";
import { recordAddress } from "./surface-address.ts";

/**
 * The start of a surface's run from its list page (S7-48): the person describes a new record, and
 * core makes the record, the surface session with the description as its first message, and the
 * run, in one transaction, so a refusal saves nothing. The rest works as a handoff with no Ask
 * session; the module's create audit row and each tool call's row are the audit.
 */

export const START_PART = "data-start";

/** The data of the first message's card part, which the model never reads. */
export type StartPartData = { readonly description: string };

/** What the model reads of the first message. */
export function startText(description: string): string {
  return `The person started this record on its page and described it below. Name the record from the description, then build it.\n\nDescription: ${description}`;
}

/**
 * Before any write: `forbidden` without agent access, `ai-off` while models are off, `not-found`
 * for a surface that is not listed or takes no new record, `forbidden` without the surface's
 * instruction key. In the transaction: the module's refusal, or `agent-run-active` while another
 * of the person's runs builds.
 */
export async function startRecordRun(
  ctx: ModuleRequestContext,
  input: { readonly surface: string; readonly description: string }
): Promise<{
  readonly sessionId: string;
  readonly recordId: string;
  readonly address: string;
}> {
  const access = await agentAccess(ctx);

  if (!access.permitted) throw new AppError(CORE_ERRORS.forbidden);

  if (access.ai !== "on" || access.chatModel === null) {
    throw new AppError(CORE_ERRORS["ai-off"]);
  }

  const providers = await ctx.tenant.capabilities.list("agent-surface");

  const provider = providers.find(({ moduleId }) => moduleId === input.surface);

  // SAFETY: validateModule checked the agent-surface provision against AgentSurface, and `list`
  // answers only providers of that name.
  const surface = provider?.implementation as AgentSurface | undefined;

  if (surface === undefined || !surface.acceptsHandoff) {
    throw new AppError(CORE_ERRORS["not-found"]);
  }

  if (!(await can(ctx.caller, surface.instructions.permission))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }

  const sessionId = randomUUID();

  const title = chatTitleFrom(input.description);

  const data: StartPartData = { description: input.description };

  const { chatModel } = access;

  const recordId = await withTransaction(ctx.tenant, async (tx) => {
    const created = await surface.createRecord(ctx, tx, { title });

    await insertHandedSession(ctx, tx, {
      id: sessionId,
      surface: input.surface,
      recordId: created,
      handedFromSessionId: null,
      title,
      modelId: chatModel,
      // The data part is the card; only the text part reaches the model.
      parts: [
        { type: START_PART, data },
        { type: "text", text: startText(input.description) },
      ],
    });

    await startRun(ctx, tx, sessionId);

    return created;
  });

  return {
    sessionId,
    recordId,
    address: recordAddress(surface.recordPage, recordId),
  };
}
