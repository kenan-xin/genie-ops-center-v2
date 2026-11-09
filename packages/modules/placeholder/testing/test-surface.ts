import type { Module } from "@genie/core";
import {
  type AgentSurface,
  capability,
  defineAgentTool,
} from "@genie/core/contracts";
import { z } from "zod";

import { placeholderModule } from "../src/module.ts";
import { insertPlaceholderRecord } from "./factories.ts";

/**
 * A test-only agent surface on the placeholder record page, so core's surface runtime is proven
 * on a real module (S7-40). The placeholder module itself declares no surface.
 */

export const SURFACE_STEP_TOOL = defineAgentTool({
  name: "placeholder-surface-step",
  description:
    "Notes one build step of the open placeholder record. Test surface only.",
  input: z.strictObject({ step: z.string().min(1) }),
  run: async () => ({ output: { noted: true }, rowCount: 0 }),
});

export const TEST_SURFACE: AgentSurface = {
  name: "Placeholder agent",
  recordPage: "/placeholder/:id",
  tools: [SURFACE_STEP_TOOL],
  instructions: {
    permission: "placeholder:use",
    lines: ["Build the open placeholder record one step at a time."],
  },
  acceptsHandoff: true,
  createRecord: async (ctx, { title }) =>
    (await insertPlaceholderRecord(ctx.tenant, { label: title })).id,
};

export const placeholderWithSurface = {
  ...placeholderModule,
  capabilities: [
    ...placeholderModule.capabilities,
    capability("agent-surface", TEST_SURFACE),
  ],
} satisfies Module;
