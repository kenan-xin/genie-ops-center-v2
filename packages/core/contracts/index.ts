import type { ZodType } from "zod";

import type { PermissionKey } from "../src/lib/module-contract/keys.ts";
import type { ModuleRequestContext } from "../src/lib/module-contract/module.ts";

/**
 * One event's contract: its name, its version and the zod schema of its payload. The emitting
 * module and every subscriber import the same contract from one place — the module that owns it
 * or, for an event another module subscribes to, this folder — so neither side imports the other
 * (DEC-42). A payload change takes a new version; a version is never reshaped in place.
 */
export type EventContract<TName extends string, TPayload> = {
  readonly name: TName;
  readonly version: number;
  readonly payload: ZodType<TPayload>;
};

/** What `defineEvent` receives: the three parts of a contract, spelled once. */
export type EventDefinition<TName extends string, TPayload> = {
  readonly name: TName;
  readonly version: number;
  readonly payload: ZodType<TPayload>;
};

/**
 * Defines one event contract. The version must be an integer above zero, so a payload change
 * cannot reuse a version and a subscriber never sees two shapes under one name and version.
 */
export function defineEvent<TName extends string, TPayload>(
  definition: EventDefinition<TName, TPayload>
): EventContract<TName, TPayload> {
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new Error(
      `Event "${definition.name}" has version ${definition.version}. A version is an integer above zero.`
    );
  }

  return {
    name: definition.name,
    version: definition.version,
    payload: definition.payload,
  };
}

/**
 * One delivered event, what every handler receives. `id` and `correlationId` are UUIDs minted at
 * the emit, `emittedAt` is the emit time in ISO 8601, and `payload` is the value the contract's
 * schema already parsed.
 */
export type EventEnvelope<TPayload> = {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly payload: TPayload;
  readonly correlationId: string;
  readonly emittedAt: string;
};

/** A value a tool answers the model with: JSON, so the model reads it and core stores it. */
export type AgentToolValue =
  | string
  | number
  | boolean
  | null
  | readonly AgentToolValue[]
  | { readonly [key: string]: AgentToolValue };

export type AgentToolResult = {
  /** What the model reads back. */
  readonly output: AgentToolValue;
  /** Rows the tool read, for the audit row (R-47). */
  readonly rowCount: number;
  /** The dataset the tool read, when it read one. */
  readonly dataset?: string;
};

/**
 * One read tool for the boss agent (R-43). It reads only through `queryDataset`, `can()` and
 * `scopesFor()` as `ctx.caller`, the person who asks (DEC-29), and core writes its audit row.
 */
export type AgentTool<TInput> = {
  /** `<moduleId>-<kebab-name>`, at most 64 characters, because providers accept no other name. */
  readonly name: string;
  readonly description: string;
  readonly input: ZodType<TInput>;
  run(ctx: ModuleRequestContext, input: TInput): Promise<AgentToolResult>;
};

/** A tool as a provider list holds it. */
export type AnyAgentTool = {
  readonly name: string;
  readonly description: string;
  readonly input: ZodType;
  run(ctx: ModuleRequestContext, input: never): Promise<AgentToolResult>;
};

/** Types one tool's `run` against its own input schema, then widens it for the provider list. */
export function defineAgentTool<TInput>(tool: AgentTool<TInput>): AnyAgentTool {
  return tool;
}

/**
 * A module's rules about its own records for the agent (R-44, R-46), one rule per line. Core adds
 * them to the system prompt, after its own rules, for a person who holds `permission` while the
 * module is on, so a person who cannot read the records never gets rules about them.
 */
export type AgentInstructions = {
  readonly permission: PermissionKey;
  readonly lines: readonly string[];
};

export type AgentToolsProvider = {
  readonly tools: readonly AnyAgentTool[];
  readonly instructions?: AgentInstructions;
};

/** Where a module takes documents; Ask and the bubble link to it for a holder of the key (R-42). */
export type DocumentInbox = {
  readonly label: string;
  readonly path: string;
  readonly permission: PermissionKey;
};

/**
 * The named synchronous interfaces a module can provide and another can ask for. A capability is
 * added here when a real module needs one, in the same change that documents it in the module
 * contract.
 */
export type CapabilityInterfaces = {
  readonly "agent-tools": AgentToolsProvider;
  readonly "document-inbox": DocumentInbox;
};

export type CapabilityName = keyof CapabilityInterfaces & string;

/** One module's provision of a named capability: the name and the interface it implements. */
export type CapabilityProvisionOf<TName extends CapabilityName> = {
  readonly name: TName;
  readonly implementation: CapabilityInterfaces[TName];
};

/** One provision, typed so its implementation matches the interface of its name. */
export function capability<TName extends CapabilityName>(
  name: TName,
  implementation: CapabilityInterfaces[TName]
): CapabilityProvisionOf<TName> {
  return { name, implementation };
}
