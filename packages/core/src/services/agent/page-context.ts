import { z } from "zod";

import { AGENT_TOOL_NAME } from "../../lib/module-contract/agent-tools.ts";
import type { DatasetFilter, DatasetOrder } from "../datasets/query.ts";

/**
 * What a page tells the agent about itself (I20, D21): names and ids only, never a row, a field
 * value or a record title. The browser and the agent route both parse it, so a page bug never
 * blocks a message and a forged body never reaches the prompt. The prompt names the page as text;
 * no tool reads it, so a forged record can only be one that the tools then refuse.
 */

const recordId = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);

const typeName = (max: number) => z.string().max(max).regex(AGENT_TOOL_NAME);

const fieldName = z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/);

const filterValue = z.union([
  z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/),
  z.number(),
  z.boolean(),
]);

// Key order is the order the page line writes, so a recording holds one exact text.
const filter = z.union([
  z.strictObject({
    field: fieldName,
    op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte"]),
    value: filterValue,
  }),
  z.strictObject({
    field: fieldName,
    op: z.literal("in"),
    values: z.array(filterValue).min(1).max(50).readonly(),
  }),
  z.strictObject({
    field: fieldName,
    op: z.literal("between"),
    from: filterValue,
    to: filterValue,
  }),
  z.strictObject({ field: fieldName, op: z.literal("isNull") }),
]);

const order = z.strictObject({
  column: fieldName,
  direction: z.enum(["asc", "desc"]),
});

const list = z
  .strictObject({
    dataset: z
      .string()
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    tab: typeName(64).optional(),
    filters: z.array(filter).min(1).max(20).readonly().optional(),
    search: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[^\p{Cc}]+$/u)
      .optional(),
    orderBy: z.array(order).min(1).max(3).readonly().optional(),
    selected: z.array(recordId).min(1).max(50).readonly().optional(),
  })
  .refine(
    (value) =>
      value.dataset !== undefined ||
      (value.filters === undefined && value.orderBy === undefined),
    { message: "Filters and a sort need the dataset they apply to." }
  );

export const agentPageContextSchema = z.strictObject({
  page: z.string().regex(/^[A-Za-z][A-Za-z0-9 ]{0,39}$/),
  record: z.strictObject({ type: typeName(64), id: recordId }).optional(),
  part: z.strictObject({ type: typeName(32), id: recordId }).optional(),
  list: list.optional(),
});

export type AgentPageContext = z.infer<typeof agentPageContextSchema>;

type ListQuery = {
  filters?: readonly DatasetFilter[];
  orderBy?: readonly DatasetOrder[];
};

function pointerOf(context: AgentPageContext): string | undefined {
  if (context.part !== undefined) {
    return `When the message says this or here, it means that ${context.part.type} of that record.`;
  }

  if (context.record !== undefined) {
    return "When the message says this or here, it means that record.";
  }

  if (context.list?.selected !== undefined) {
    return "When the message says these, it means the selected rows.";
  }

  if (context.list !== undefined) {
    return "When the message says these or this list, it means the rows on the page.";
  }

  return undefined;
}

/** The one prompt line that names the page, on one line, so it never splits the prompt. */
export function pageContextLine(context: AgentPageContext): string {
  const { page, record, part, list: shown } = context;

  const sentences = [`The person is on the ${page} page.`];

  if (record !== undefined) {
    sentences.push(
      `The person has the ${record.type} record ${record.id} open beside this chat.`
    );
  }

  if (part !== undefined) {
    sentences.push(`The page shows its ${part.type} ${part.id}.`);
  }

  if (shown?.tab !== undefined) {
    sentences.push(`The page shows its ${shown.tab} tab.`);
  }

  if (shown?.dataset !== undefined) {
    const query: ListQuery = {};

    if (shown.filters !== undefined) query.filters = shown.filters;

    if (shown.orderBy !== undefined) query.orderBy = shown.orderBy;

    sentences.push(
      `The page lists the rows that query-dataset answers for ${JSON.stringify({ dataset: shown.dataset, query })}.`
    );
  }

  if (shown?.search !== undefined) {
    sentences.push(
      `The person also searched the list for ${JSON.stringify(shown.search)}. query-dataset cannot apply that search, so say that the answer leaves it out.`
    );
  }

  if (shown?.selected !== undefined) {
    sentences.push(
      `The person selected the rows with the record keys ${shown.selected.join(", ")}.`
    );
  }

  const pointer = pointerOf(context);

  if (pointer !== undefined) sentences.push(pointer);

  return sentences.join(" ");
}
