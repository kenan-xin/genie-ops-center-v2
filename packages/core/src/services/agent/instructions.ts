import type { AgentToolsProvider } from "../../../contracts/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import { can } from "../authorization/index.ts";

/**
 * The rule lines of every enabled `agent-tools` provider whose key the caller holds, in
 * registration order (R-44, R-46). A person who cannot read a module's records gets no rules
 * about them, and the prompt of every other person stays the same.
 */
export async function moduleInstructionLines(
  ctx: ModuleRequestContext
): Promise<readonly string[]> {
  const providers = await ctx.tenant.capabilities.list("agent-tools");

  const instructions = providers.flatMap(({ implementation }) => {
    // SAFETY: validateModule checked each agent-tools provision against AgentToolsProvider before
    // the registry took it, and `list` answers only enabled providers of that name.
    const given = (implementation as AgentToolsProvider).instructions;

    return given === undefined ? [] : [given];
  });

  const held = await Promise.all(
    instructions.map(({ permission }) => can(ctx.caller, permission))
  );

  return instructions.flatMap(({ lines }, index) =>
    held[index] === true ? lines : []
  );
}
