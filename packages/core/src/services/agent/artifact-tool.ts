import { randomUUID } from "node:crypto";

import { type Tool, tool } from "ai";
import { z } from "zod";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import type { AuditMetadataValue } from "../audit/index.ts";
import { checkChart } from "../charts/index.ts";
import { panelConfigSchema } from "../charts/panel-config.ts";
import {
  type ArtifactKind,
  type PendingVersion,
  storedArtifact,
} from "./artifacts.ts";
import { COULD_NOT_RUN, refusalText, writeToolAudit } from "./tools.ts";

/**
 * The `make-artifact` tool (`DEC-56`, R-45a): it checks a panel config through the chart gate as
 * the person, and records a pending version that the route writes with the answer. The model names
 * an artifact by its number in the chat and reads back no id, so recorded requests stay stable.
 */

export const MAKE_ARTIFACT = "make-artifact";

/** The card part of an answer: which artifact version the answer made, never its figures. */
export type ArtifactCardPart = {
  readonly type: "data-artifact";
  readonly id: string;
  readonly data: { readonly artifactId: string; readonly version: number };
};

/** One turn's artifact work: the stored count read before the model runs, and what the tool made. */
export type ArtifactTurn = {
  readonly sessionId: string;
  readonly storedCount: number;
  readonly pending: PendingVersion[];
  /** Writes the card part into the UI stream; the route sets it when the stream starts. */
  write: (part: ArtifactCardPart) => void;
};

/** A turn with nothing made yet; its writer throws until the route sets the stream's writer. */
export function artifactTurn(
  sessionId: string,
  storedCount: number
): ArtifactTurn {
  return {
    sessionId,
    storedCount,
    pending: [],
    write: () => {
      throw new Error("The artifact turn has no stream writer.");
    },
  };
}

const DESCRIPTION =
  "Makes a chart or a table that the person can open beside the chat, from a checked panel config. Use type table for rows, or bar, line, area or donut for a chart. donut and table take a list of exactly one series. A donut series has name, dataset, query, category and value. A table series has name, dataset and query only. A table holds every row of its query, so leave out limit unless the person asks for the first rows. The chat shows the first 5 rows of a table and how many more. bar, line and area take one to eight series with x and y. To change an artifact of this chat, give its number as artifact: the change makes its next version. An artifact keeps its kind. Answers the artifact's number, its version and its title.";

const inputSchema = z.strictObject({
  artifact: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "The number of this chat's artifact to change. Leave it out to make a new artifact."
    ),
  config: panelConfigSchema,
});

function invalid(path: string, message: string): AppError {
  return new AppError(CORE_ERRORS["invalid-input"], {
    issues: [{ path, message }],
  });
}

export function artifactTool(
  ctx: ModuleRequestContext,
  session: { readonly id: string },
  turn: ArtifactTurn
): Tool {
  return tool({
    description: DESCRIPTION,
    inputSchema,
    execute: async (input, { toolCallId }) => {
      // SAFETY: the AI SDK parsed the input from the model's JSON with this tool's schema, so it is
      // a JSON value.
      const query = input as AuditMetadataValue;

      const record = (
        outcome: string,
        rowCount: number,
        dataset: string | null
      ) =>
        writeToolAudit(ctx, session, {
          tool: MAKE_ARTIFACT,
          query,
          outcome,
          rowCount,
          dataset,
        });

      let made: {
        pending: PendingVersion;
        rowCount: number;
        dataset: string | null;
      };

      try {
        made = await nextVersion(ctx, turn, input, toolCallId);
      } catch (error) {
        if (error instanceof AppError) {
          await record(error.code, 0, null);

          throw new Error(refusalText(error), { cause: error });
        }

        await record("failed", 0, null);

        throw new Error(COULD_NOT_RUN, { cause: error });
      }

      const { pending } = made;

      await record("answered", made.rowCount, made.dataset);

      return {
        artifact: pending.number,
        version: pending.version,
        title: pending.title,
      };
    },
  });
}

async function nextVersion(
  ctx: ModuleRequestContext,
  turn: ArtifactTurn,
  input: z.infer<typeof inputSchema>,
  toolCallId: string
) {
  const { config, data } = await checkChart(ctx, input.config);

  const kind: ArtifactKind = config.type === "table" ? "table" : "chart";

  const stored =
    input.artifact !== undefined && input.artifact <= turn.storedCount
      ? await storedArtifact(ctx, turn.sessionId, input.artifact)
      : undefined;

  // No await from here to the push: two calls of one step take distinct numbers and versions.
  const latest = turn.pending.findLast(
    ({ number }) => number === input.artifact
  );

  const base =
    latest === undefined
      ? stored && {
          id: stored.id,
          kind: stored.kind,
          version: stored.latestVersion,
        }
      : { id: latest.artifactId, kind: latest.kind, version: latest.version };

  let pending: PendingVersion;

  if (input.artifact === undefined) {
    pending = {
      toolCallId,
      artifactId: randomUUID(),
      number:
        turn.storedCount + turn.pending.filter(({ isNew }) => isNew).length + 1,
      isNew: true,
      kind,
      title: config.title,
      version: 1,
      definition: config,
    };
  } else {
    if (base === undefined) {
      throw invalid("artifact", `This chat has no artifact ${input.artifact}.`);
    }

    if (base.kind !== kind) {
      throw invalid(
        "config.type",
        `An artifact keeps its kind. Make a new artifact for a ${kind}.`
      );
    }

    pending = {
      toolCallId,
      artifactId: base.id,
      number: input.artifact,
      isNew: false,
      kind,
      title: config.title,
      version: base.version + 1,
      definition: config,
    };
  }

  turn.pending.push(pending);
  turn.write({
    type: "data-artifact",
    id: toolCallId,
    data: { artifactId: pending.artifactId, version: pending.version },
  });

  return {
    pending,
    rowCount: data.rows.length,
    dataset: data.datasets[0] ?? null,
  };
}
