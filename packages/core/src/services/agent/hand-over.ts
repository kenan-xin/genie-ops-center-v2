import { randomUUID } from "node:crypto";

import { asSchema, jsonSchema, type Tool, tool } from "ai";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import type { AuditMetadataValue } from "../audit/index.ts";
import { listDatasets } from "../datasets/index.ts";
import type { ArtifactTurn } from "./artifact-tool.ts";
import { listOwnArtifacts } from "./artifacts.ts";
import {
  BRIEF_PART,
  type BriefChart,
  type BriefPartData,
  briefProblems,
  briefSchema,
  briefText,
} from "./brief.ts";
import { startRun } from "./run-job.ts";
import { findOwnRun } from "./runs.ts";
import { findOwnSession, insertHandedSession } from "./store.ts";
import { recordAddress } from "./surface-address.ts";
import type { HandoffTarget } from "./surfaces.ts";
import { COULD_NOT_RUN, refusalText, writeToolAudit } from "./tools.ts";

/**
 * The `hand-over` tool (R-42b, S7-41): on the person's own request, Ask hands the building of one
 * new record over to a surface's agent. One transaction makes the record, the target session with
 * the brief as its first message, the audit row and the run, so a refusal saves nothing. The model
 * reads no id back, because recordings match the whole request (P11-18); the chat gets a card part.
 */

export const HAND_OVER = "hand-over";

export const HANDOFF_PART = "data-handoff";

export type HandoffCardData = {
  readonly sessionId: string;
  readonly title: string;
  readonly agentName: string;
  readonly address: string;
};

/** The card part of an answer: the target session and the page that builds the record. */
export type HandoffCardPart = {
  readonly type: "data-handoff";
  /** The tool call id. */
  readonly id: string;
  readonly data: HandoffCardData;
};

function description(targets: readonly HandoffTarget[]): string {
  const agents = targets
    .map(({ id, surface }) => `${id} (${surface.name})`)
    .join(", ");

  return `Hands the building of one new record over to the agent of the page that builds it, and opens that page. Call it only when the person's own message asks to build such a record. Pass a short brief: a title, the goal, the facts from this chat with their dataset and date, the datasets to read, the period, the numbers of this chat's artifacts to pass, and what you leave out. That agent reads the datasets again. The agents that take work: ${agents}. Answers the agent's name and the title. Then tell the person in one sentence that this agent builds it on its own page.`;
}

function invalid(issues: readonly { path: string; message: string }[]) {
  return new AppError(CORE_ERRORS["invalid-input"], { issues: [...issues] });
}

/** The latest version of each artifact the brief names, as the target reads it. */
async function chartsOf(
  ctx: ModuleRequestContext,
  sessionId: string,
  numbers: readonly number[]
): Promise<{
  readonly known: ReadonlySet<number>;
  readonly charts: readonly BriefChart[];
}> {
  const artifacts = await listOwnArtifacts(ctx, sessionId);

  const charts = numbers.flatMap((number) => {
    const artifact = artifacts.find((entry) => entry.number === number);

    const latest = artifact?.versions.find(
      ({ version }) => version === artifact.latestVersion
    );

    return artifact === undefined || latest === undefined
      ? []
      : [{ title: artifact.title, config: latest.definition }];
  });

  return { known: new Set(artifacts.map(({ number }) => number)), charts };
}

/** `targets` holds at least one surface: the tool set offers the tool only then. */
export function handOverTool(
  ctx: ModuleRequestContext,
  session: { readonly id: string },
  turn: ArtifactTurn,
  targets: readonly HandoffTarget[]
): Tool {
  const [first, ...rest] = targets;

  if (first === undefined) throw new Error("hand-over needs a surface.");

  const schema = briefSchema([first.id, ...rest.map(({ id }) => id)]);

  return tool({
    description: description(targets),
    // The input is parsed inside `execute`, so a refusal answers with its field messages (PC11).
    inputSchema: jsonSchema(() => asSchema(schema).jsonSchema, {
      validate: (value) => ({ success: true, value }),
    }),
    execute: async (input, { toolCallId, abortSignal }) => {
      const parsed = schema.safeParse(input);

      // SAFETY: the AI SDK parsed the input from the model's JSON text, so it is a JSON value.
      const query = (
        parsed.success ? parsed.data : input
      ) as AuditMetadataValue;

      const record = (outcome: string) =>
        writeToolAudit(ctx, session, {
          tool: HAND_OVER,
          query,
          outcome,
          rowCount: 0,
          dataset: null,
        });

      // A call the model sent just before Stop does not run (tech plan wave 5, "Stop").
      if (abortSignal?.aborted === true) {
        await record("stopped");

        throw new Error(COULD_NOT_RUN);
      }

      let card: HandoffCardData;

      try {
        if (!parsed.success) {
          throw invalid(
            parsed.error.issues.map(({ path, message }) => ({
              path: path.join("."),
              message,
            }))
          );
        }

        const brief = parsed.data;

        const target = targets.find(({ id }) => id === brief.surface) ?? first;

        const [datasets, artifacts, asker] = await Promise.all([
          listDatasets(ctx),
          chartsOf(ctx, session.id, brief.artifacts),
          findOwnSession(ctx, session.id),
        ]);

        const problems = briefProblems(brief, {
          datasets: new Set(datasets.map(({ name }) => name)),
          artifacts: artifacts.known,
        });

        if (problems.length > 0) throw invalid(problems);

        if (asker === undefined) throw new AppError(CORE_ERRORS["not-found"]);

        const targetSessionId = randomUUID();

        const data: BriefPartData = {
          title: brief.title,
          goal: brief.goal,
          facts: brief.facts,
          datasets: brief.datasets,
          period: brief.period,
          notPassed: brief.notPassed,
          charts: artifacts.charts.map(({ title }) => title),
        };

        const recordId = await withTransaction(ctx.tenant, async (tx) => {
          const created = await target.surface.createRecord(ctx, tx, {
            title: brief.title,
          });

          await insertHandedSession(ctx, tx, {
            id: targetSessionId,
            surface: target.id,
            recordId: created,
            handedFromSessionId: session.id,
            title: brief.title,
            modelId: asker.modelId,
            // The data part is the card; only the text part reaches the model.
            parts: [
              { type: BRIEF_PART, data },
              { type: "text", text: briefText(brief, artifacts.charts) },
            ],
          });

          await writeToolAudit(
            ctx,
            session,
            {
              tool: HAND_OVER,
              query,
              outcome: "handed-over",
              rowCount: 0,
              dataset: null,
              targetSessionId,
            },
            tx
          );

          await startRun(ctx, tx, targetSessionId);

          return created;
        });

        card = {
          sessionId: targetSessionId,
          title: brief.title,
          agentName: target.surface.name,
          address: recordAddress(target.surface.recordPage, recordId),
        };
      } catch (error) {
        if (error instanceof AppError) {
          // One build per person: the card leads to the work that builds now (P11-24).
          if (error.code === "agent-run-active") {
            const running = await findOwnRun(ctx);

            const surface = targets.find(({ id }) => id === running?.surface);

            if (
              running !== undefined &&
              surface !== undefined &&
              running.recordId !== null
            ) {
              turn.write({
                type: HANDOFF_PART,
                id: toolCallId,
                data: {
                  sessionId: running.id,
                  title: running.title,
                  agentName: surface.surface.name,
                  address: recordAddress(
                    surface.surface.recordPage,
                    running.recordId
                  ),
                },
              });
            }
          }

          await record(error.code);

          throw new Error(refusalText(error), { cause: error });
        }

        await record("failed");

        throw new Error(COULD_NOT_RUN, { cause: error });
      }

      turn.write({ type: HANDOFF_PART, id: toolCallId, data: card });

      return { handedTo: card.agentName, title: card.title };
    },
  });
}
