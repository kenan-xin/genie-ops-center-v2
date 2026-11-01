/**
 * The model evaluation of Spec 7 (R-58, S7-14). It never runs in a gate: it has no Nx target, and
 * `gate-guard.test.ts` keeps it that way. Recorded is the default and replays the test recordings;
 * only the owner runs it live, from a shell with the key (`README.md` beside this file):
 *
 *   EVALUATION_ARGS="--out <directory>" pnpm --dir apps/genie exec vitest run --config tools/evaluation/vitest.evaluation.config.ts
 *
 * It runs under Vitest, not plain Node, because the module declarations it composes import `.tsx`
 * pages. Its own config collects only `run.eval.ts`, and no other config collects that file.
 *
 * Each model gets its own disposable deployment, because the model connection is a cached setting
 * (DEC-46). Every case of every run is scored, also when its model call fails.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  handleAgentChat,
  type ModuleRequestContext,
  principalFor,
  readOwnSession,
  registerModuleRuntime,
  type TenantContext,
} from "@genie/core";
import {
  agentRequest,
  answerChartConfigs,
  enableModules,
  insertPersonWith,
  loadModelRecordings,
  markSetupDone,
  readAgentReply,
  replayModelTransport,
  startDisposableDeployment,
  useModelTransport,
  writeModelConnection,
} from "@genie/core/testing";
import { invoicesModule } from "@genie/module-invoices";
import {
  INVOICES_READING_RECORDINGS,
  type LiveReading,
  readDemoFile,
  readLiveUpload,
  seedDemoHistory,
} from "@genie/module-invoices/testing";
import { placeholderModule } from "@genie/module-placeholder";

import {
  agentFor,
  type AnswerChart,
  question,
} from "../../testing/invoice-answer-readers.ts";
import { APP_AGENT_RECORDINGS } from "../../testing/model-replay.ts";
import type { CaseResult } from "./case-result.ts";
import { CHART_CASES, casesWithin } from "./cases.ts";
import { expectedReadingOf } from "./expected.ts";
import { type EvaluationOptions, parseOptions } from "./options.ts";
import { recommendDefaults, renderReport, summarize } from "./report.ts";
import {
  type RefusedChart,
  refusalCode,
  scoreAnswer,
  scoreCharts,
} from "./score-answers.ts";
import { scoreExtraction } from "./score-extraction.ts";
import { costMeter, liveTransport } from "./transport.ts";

const MODULES = [placeholderModule, invoicesModule];

async function personWith(
  tenant: TenantContext,
  permissions: readonly string[]
): Promise<ModuleRequestContext> {
  const { userId } = await insertPersonWith(tenant, permissions);

  return {
    tenant,
    caller: principalFor({
      tenant,
      modules: MODULES,
      userId,
      authenticated: true,
    }),
  };
}

async function evaluateModel(
  options: EvaluationOptions,
  cases: ReturnType<typeof casesWithin>,
  model: string
): Promise<CaseResult[]> {
  const deployment = await startDisposableDeployment(MODULES);
  const tenant = deployment.context;
  const results: CaseResult[] = [];

  try {
    await markSetupDone(tenant);
    // Before any settings read, so the 10 s settings cache holds these values (DEC-46).
    await writeModelConnection(tenant, {
      allowed: [model],
      chat: model,
      document: model,
      reportingDate: "2026-10-27",
    });
    await enableModules(tenant, ["placeholder", "invoices"]);
    registerModuleRuntime(tenant, MODULES);

    const seeder = await insertPersonWith(tenant, [
      "invoices:read",
      "invoices:write",
      "invoices:use",
    ]);

    await seedDemoHistory(tenant, { userId: seeder.userId });

    const send = costMeter(
      options.key === undefined
        ? replayModelTransport([
            ...loadModelRecordings(INVOICES_READING_RECORDINGS),
            ...loadModelRecordings(APP_AGENT_RECORDINGS),
          ])
        : liveTransport(options.key)
    );

    useModelTransport(tenant, { transport: send.fetch });

    const asker = await personWith(tenant, [
      "core:ask:use",
      "invoices:read",
      "invoices:use",
    ]);

    const agent = agentFor(asker, "req-evaluation");

    /* oxlint-disable no-await-in-loop -- one model request at a time, so each case gets its own time and cost. */
    for (let run = 1; run <= options.runs; run += 1) {
      for (const { id, file } of cases.extraction) {
        const started = performance.now();
        const before = send.mark();
        let reason: string | undefined;
        let reading: LiveReading | null = null;

        try {
          reading = await readLiveUpload(tenant, readDemoFile(file));
        } catch (error) {
          reason = String(error);
        }

        const score = scoreExtraction(reading, expectedReadingOf(id));

        results.push({
          track: "extraction",
          caseId: id,
          model,
          run,
          pass: score.pass,
          reason: reason ?? score.mismatches.join(", "),
          ms: performance.now() - started,
          costUsd: send.since(before),
        });
      }

      for (const session of cases.answers) {
        const sessionId = randomUUID();

        // The question that broke the session and its reason; the later questions are not asked.
        let broken:
          | { readonly id: string; readonly reason: string }
          | undefined;

        for (const id of session) {
          const started = performance.now();
          const before = send.mark();
          const errors: unknown[] = [];
          let checked: (AnswerChart | RefusedChart)[] = [];

          if (broken === undefined) {
            const reply = await handleAgentChat(
              asker,
              agentRequest({
                sessionId,
                message: {
                  id: "client-message",
                  role: "user",
                  parts: [{ type: "text", text: question(id).prompt }],
                },
              }),
              { logError: (cause) => errors.push(cause) }
            );

            const read = await readAgentReply(reply).then(
              () => true,
              () => false
            );

            if (!read || errors.length > 0) {
              broken = {
                id,
                reason:
                  errors.length === 0
                    ? "The agent reply did not read."
                    : errors.map(String).join(" | "),
              };
            } else {
              const { messages } = await readOwnSession(asker, sessionId);

              const text = (messages.at(-1)?.parts ?? [])
                .flatMap((part) => (part.type === "text" ? [part.text] : []))
                .join("");

              const configs = (() => {
                try {
                  return answerChartConfigs(text);
                } catch (error) {
                  broken = { id, reason: String(error) };

                  return [];
                }
              })();

              checked = await Promise.all(
                configs.map(async (config) => {
                  try {
                    return await agent.chart({ config });
                  } catch (error) {
                    return { config, refused: refusalCode(error) };
                  }
                })
              );
            }
          }

          const ms = performance.now() - started;
          const costUsd = send.since(before);

          const answer =
            broken === undefined
              ? scoreAnswer(
                  id,
                  checked.filter(
                    (chart): chart is AnswerChart => !("refused" in chart)
                  )
                )
              : {
                  pass: false,
                  reason:
                    broken.id === id
                      ? broken.reason
                      : `not asked: question ${broken.id} failed earlier in the session`,
                };

          results.push({
            track: "answers",
            caseId: id,
            model,
            run,
            ...answer,
            ms,
            costUsd,
          });

          for (const chart of broken === undefined
            ? scoreCharts(id, checked)
            : CHART_CASES.filter((item) => item.questionId === id).map(
                // The answer case of this question carries the reason once.
                ({ title }) => ({ title, pass: false, reason: "no-answer" })
              )) {
            results.push({
              track: "charts",
              caseId: `${id}: ${chart.title}`,
              model,
              run,
              pass: chart.pass,
              reason: chart.reason,
              ms,
              costUsd,
            });
          }

          console.log(
            `${model} run ${run} ${id}: ${answer.pass ? "pass" : "fail"}`
          );
        }
      }
    }
    /* oxlint-enable no-await-in-loop */
  } finally {
    await deployment.stop();
  }

  return results;
}

/** Runs the evaluation and writes `results.json` to `--out`. Throws a refusal as its message. */
export async function runEvaluation(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>
): Promise<void> {
  const options = parseOptions(argv, env);

  if ("refused" in options) throw new Error(options.refused);

  // Before any model call, so a smoke run pays only for its own cases.
  const cases = casesWithin(options.limit);
  const perRun = cases.extraction.length + cases.answers.flat().length;

  console.log(
    `Transport ${options.transport}. Models ${options.models.join(", ")}. ${options.runs} runs. ${cases.extraction.length} extraction, ${cases.answers.flat().length} answer and ${cases.charts.length} chart cases.`
  );

  if (options.transport === "live") {
    console.log(
      `At least ${perRun * options.runs * options.models.length} model requests, plus one per tool call inside an answer.`
    );
  }

  const results: CaseResult[] = [];

  await mkdir(options.out, { recursive: true });

  /* oxlint-disable no-await-in-loop -- one deployment at a time. */
  for (const model of options.models) {
    results.push(...(await evaluateModel(options, cases, model)));

    // After each model, so a later failure keeps the paid results of the models before it.
    await writeFile(
      join(options.out, "results.json"),
      `${JSON.stringify(results, undefined, 2)}\n`,
      "utf8"
    );
  }
  /* oxlint-enable no-await-in-loop */

  const summaries = summarize(results);
  const defaults = recommendDefaults(summaries);

  await writeFile(
    join(options.out, "report.json"),
    `${JSON.stringify({ transport: options.transport, runs: options.runs, limit: options.limit, summaries, defaults }, undefined, 2)}\n`,
    "utf8"
  );

  await writeFile(
    join(options.out, "report.md"),
    renderReport({
      transport: options.transport,
      models: options.models,
      runs: options.runs,
      limit: options.limit,
      summaries,
      results,
      defaults,
      date: new Date().toISOString().slice(0, 10),
    }),
    "utf8"
  );

  console.log(
    `Wrote results.json, report.json and report.md to ${options.out}.`
  );
}
