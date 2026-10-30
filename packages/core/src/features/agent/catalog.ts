import {
  type ComponentRenderer,
  createLibrary,
  defineComponent,
  type Library,
  type PromptOptions,
} from "@openuidev/react-lang";
import { z } from "zod";

import { panelConfigSchema } from "../../services/charts/panel-config.ts";

/**
 * The catalog of an answer (Spec 7 R-45, DEC-29): one root and four blocks. The prompt the model
 * receives depends only on the component names, descriptions and props, so the same catalog is
 * built here for the prompt and, by the renderer, for the screen (P9, P10).
 */
export type AnswerViews = {
  readonly Answer: ComponentRenderer;
  readonly Heading: ComponentRenderer;
  readonly Paragraph: ComponentRenderer;
  readonly List: ComponentRenderer;
  readonly Chart: ComponentRenderer;
};

/** The catalog with the given views. The prompt depends on names, descriptions and props only. */
export function answerLibrary(views: AnswerViews): Library {
  const Heading = defineComponent({
    name: "Heading",
    description: "A heading that starts a section of the answer.",
    props: z.object({
      text: z.string().describe("The heading text."),
      level: z
        .union([z.literal(2), z.literal(3)])
        .optional()
        .describe("The heading level, 2 or 3. Default 2."),
    }),
    component: views.Heading,
  });

  const Paragraph = defineComponent({
    name: "Paragraph",
    description: "One paragraph of prose.",
    props: z.object({
      text: z.string().describe("The paragraph text."),
    }),
    component: views.Paragraph,
  });

  const List = defineComponent({
    name: "List",
    description: "A list of short text items.",
    props: z.object({
      items: z.array(z.string()).describe("The items, in order."),
      ordered: z
        .boolean()
        .optional()
        .describe("Number the items. Default false."),
    }),
    component: views.List,
  });

  const Chart = defineComponent({
    name: "Chart",
    description:
      "One panel from a checked panel config. Use type kpi for one figure, table for rows, bar, line, area or donut for a chart. " +
      "kpi, donut and table take a list of exactly one series. " +
      "A kpi series has name, dataset, query and value. " +
      "A donut series has name, dataset, query, category and value. " +
      "A table series has name, dataset and query only. " +
      "bar, line and area take one to eight series with x and y.",
    props: z.object({
      config: panelConfigSchema,
    }),
    component: views.Chart,
  });

  const Answer = defineComponent({
    name: "Answer",
    description:
      "The answer's root. Its children are the blocks in reading order: Heading, Paragraph, List and Chart.",
    props: z.object({
      children: z
        .array(z.union([Heading.ref, Paragraph.ref, List.ref, Chart.ref]))
        .describe("The blocks of the answer, in reading order."),
    }),
    component: views.Answer,
  });

  return createLibrary({
    root: "Answer",
    components: [Answer, Heading, Paragraph, List, Chart],
  });
}

/** What the catalog prompt adds to the fixed rules (R-45). */
export const ANSWER_PROMPT_OPTIONS: PromptOptions = {
  additionalRules: [
    "Put every figure, chart and table in a Chart with a panel config. Never type the values of a chart or a table.",
    "Write prose only with Heading, Paragraph and List.",
  ],
  examples: [
    [
      "root = Answer([heading, summary, figures])",
      'heading = Heading("Example totals", 2)',
      'summary = Paragraph("Figures from the example.items dataset.")',
      'figures = Chart({type: "kpi", title: "Items", series: [{name: "Items", dataset: "example.items", query: {aggregates: [{fn: "count", as: "items"}]}, value: "items"}]})',
    ].join("\n"),
  ],
};
