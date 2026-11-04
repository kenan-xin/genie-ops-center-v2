import { z } from "zod";

import type { AgentMessage, ChatLabels } from "../../services/agent/index.ts";
import { fmtDate } from "../audit/helpers.ts";
import { toolNameOf } from "./step-model.ts";

type MessagePart = AgentMessage["parts"][number];

/** The fields of a `query-dataset` output that an answer's source and method lines read. */
const readOutput = z.object({
  dataset: z.string(),
  asOf: z.string(),
  rows: z.array(z.unknown()),
});

type Read = z.infer<typeof readOutput>;

/** Every finished dataset read of an answer, in order; a refused or running call read nothing. */
function readsOf(parts: readonly MessagePart[]): readonly Read[] {
  return parts.flatMap((part) => {
    if (
      toolNameOf(part) !== "query-dataset" ||
      !("state" in part) ||
      part.state !== "output-available"
    )
      return [];

    const parsed = readOutput.safeParse(part.output);

    return parsed.success ? [parsed.data] : [];
  });
}

/** The titles of the datasets an answer read, once each; an untitled one keeps its name (5.1). */
export function sourceTitles(
  parts: readonly MessagePart[],
  labels: ChatLabels
): readonly string[] {
  return [
    ...new Set(
      readsOf(parts).map(
        (read) => labels.datasets[read.dataset] ?? read.dataset
      )
    ),
  ];
}

/** One line per finished read: "<Title>: <n> rows, as of <day>" (5.2). */
export function methodLines(
  parts: readonly MessagePart[],
  labels: ChatLabels
): readonly string[] {
  return readsOf(parts).map((read) => {
    const title = labels.datasets[read.dataset] ?? read.dataset;
    const rows = read.rows.length;

    // The reporting date is a calendar day, so it is shown in UTC and never moves a day.
    return `${title}: ${rows.toLocaleString("en-GB")} ${rows === 1 ? "row" : "rows"}, as of ${fmtDate(read.asOf, "UTC")}`;
  });
}
