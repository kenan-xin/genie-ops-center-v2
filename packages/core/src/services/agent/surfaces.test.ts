import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type AgentInstructions,
  type AgentSurface,
  type AgentToolsProvider,
  defineAgentTool,
} from "../../../contracts/index.ts";
import type { CapabilityProvider } from "../capabilities/index.ts";
import { sessionTools } from "./surfaces.ts";

function tool(name: string) {
  return defineAgentTool({
    name,
    description: "A test tool.",
    input: z.object({}),
    run: async () => ({ output: 0, rowCount: 0 }),
  });
}

function rules(permission: `${string}:${string}`): AgentInstructions {
  return { permission, lines: [`Rules of ${permission}.`] };
}

function toolsOf(
  moduleId: string,
  names: readonly string[]
): CapabilityProvider {
  const implementation: AgentToolsProvider = {
    tools: names.map(tool),
    instructions: rules(`${moduleId}:use`),
  };

  return { moduleId, implementation };
}

const betaSurface: AgentSurface = {
  name: "Beta agent",
  recordPage: "/beta/:id",
  tools: [tool("beta-change")],
  instructions: rules("beta:change"),
  acceptsHandoff: true,
  createRecord: async () => "record-1",
};

const agentTools = [
  toolsOf("alpha", ["alpha-read", "alpha-count"]),
  toolsOf("beta", ["beta-read"]),
];

const surfaces: readonly CapabilityProvider[] = [
  { moduleId: "beta", implementation: betaSurface },
];

function offeredTo(surface: string) {
  const selected = sessionTools(surface, agentTools, surfaces);

  return (
    selected && {
      files: selected.files,
      tools: selected.moduleTools.map(({ name }) => name),
      instructions: selected.instructions.map(({ permission }) => permission),
    }
  );
}

describe("sessionTools", () => {
  it("gives Ask every module's agent-tools and make-file, and no surface tool", () => {
    expect(offeredTo("core:ask")).toEqual({
      files: true,
      tools: ["alpha-read", "alpha-count", "beta-read"],
      instructions: ["alpha:use", "beta:use"],
    });
  });

  it("gives a surface session its own agent-tools, then its surface tools, and no make-file", () => {
    expect(offeredTo("beta")).toEqual({
      files: false,
      tools: ["beta-read", "beta-change"],
      instructions: ["beta:use", "beta:change"],
    });
  });

  it("answers nothing for a surface that is not listed", () => {
    expect(offeredTo("alpha")).toBeUndefined();
  });
});
