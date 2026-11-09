import { ASK_SURFACE } from "../../lib/module-contract/agent-tools.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import { can } from "../authorization/index.ts";
import { offeredSessionTools } from "./tools.ts";

/**
 * The rule lines of the session's surface whose key the caller holds, in order (R-44, R-46): on
 * Ask every enabled `agent-tools` provider in registration order, on a surface its module's rules
 * then the surface's. A person who cannot read a module's records gets no rules about them, and
 * the prompt of every other person stays the same.
 */
export async function moduleInstructionLines(
  ctx: ModuleRequestContext,
  surface: string = ASK_SURFACE
): Promise<readonly string[]> {
  const { instructions } = await offeredSessionTools(ctx, surface);

  const held = await Promise.all(
    instructions.map(({ permission }) => can(ctx.caller, permission))
  );

  return instructions.flatMap(({ lines }, index) =>
    held[index] === true ? lines : []
  );
}
