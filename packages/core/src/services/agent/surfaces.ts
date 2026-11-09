import type {
  AgentInstructions,
  AgentSurface,
  AgentToolsProvider,
  AnyAgentTool,
} from "../../../contracts/index.ts";
import { ASK_SURFACE } from "../../lib/module-contract/agent-tools.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import type { CapabilityProvider } from "../capabilities/index.ts";
import type { SurfaceView } from "./surface-address.ts";

/** Every listed surface as the screens see it, in registration order. */
export async function listSurfaces(
  ctx: ModuleRequestContext
): Promise<readonly SurfaceView[]> {
  const providers = await ctx.tenant.capabilities.list("agent-surface");

  return providers.map(({ moduleId, implementation }) => {
    // SAFETY: validateModule checked the agent-surface provision against AgentSurface, and `list`
    // answers only providers of that name.
    const { name, recordPage, acceptsHandoff } = implementation as AgentSurface;

    return { id: moduleId, name, recordPage, acceptsHandoff };
  });
}

export type SessionTools = {
  /** Ask offers `make-file`. A surface session does not (R-43, amended 2026-11-08). */
  readonly files: boolean;
  /** In the order the model gets them. */
  readonly moduleTools: readonly AnyAgentTool[];
  /** In prompt order, before the permission check. */
  readonly instructions: readonly AgentInstructions[];
  /** The surfaces this session may hand work over to: on Ask, each listed one that accepts a handoff. */
  readonly handoff: readonly HandoffTarget[];
};

export type HandoffTarget = {
  readonly id: string;
  readonly surface: AgentSurface;
};

/**
 * The module tools and prompt rules of one session (R-43, amended 2026-11-08). Ask gets every
 * enabled module's `agent-tools` and never a surface tool. A surface session gets its own module's
 * `agent-tools`, then its surface's tools. Undefined when the surface is not listed: its module is
 * off, or declares no surface.
 */
export function sessionTools(
  surface: string,
  agentTools: readonly CapabilityProvider[],
  surfaces: readonly CapabilityProvider[]
): SessionTools | undefined {
  const own =
    surface === ASK_SURFACE
      ? agentTools
      : agentTools.filter(({ moduleId }) => moduleId === surface);

  // SAFETY: validateModule checked each agent-tools provision against AgentToolsProvider before
  // the registry took it, and `list` answers only providers of that name.
  const providers = own.map(
    ({ implementation }) => implementation as AgentToolsProvider
  );

  const tools = providers.flatMap(({ tools: list }) => list);

  const instructions = providers.flatMap(({ instructions: given }) =>
    given === undefined ? [] : [given]
  );

  if (surface === ASK_SURFACE) {
    const handoff = surfaces.flatMap(({ moduleId, implementation }) => {
      // SAFETY: as below, validateModule checked each agent-surface provision.
      const declared = implementation as AgentSurface;

      return declared.acceptsHandoff
        ? [{ id: moduleId, surface: declared }]
        : [];
    });

    return { files: true, moduleTools: tools, instructions, handoff };
  }

  const provider = surfaces.find(({ moduleId }) => moduleId === surface);

  if (provider === undefined) return undefined;

  // SAFETY: validateModule checked the agent-surface provision against AgentSurface, and `list`
  // answers only providers of that name.
  const declared = provider.implementation as AgentSurface;

  return {
    files: false,
    moduleTools: [...tools, ...declared.tools],
    instructions: [...instructions, declared.instructions],
    handoff: [],
  };
}
