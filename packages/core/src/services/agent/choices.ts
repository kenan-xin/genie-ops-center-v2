import type { StopCondition, ToolSet } from "ai";
import { z } from "zod";

/** Core's tool that shows the person a question with choices as buttons (R-43, R-46). */
export const OFFER_CHOICES = "offer-choices";

export const offerChoicesInput = z.strictObject({
  question: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("The question, in one short sentence."),
  choices: z
    .array(z.string().trim().min(1).max(40))
    .min(2)
    .max(4)
    .refine(
      (list) => new Set(list).size === list.length,
      "Give each choice once."
    )
    .describe(
      "Two to four short answers of a few words each, in the order that the rule gives."
    ),
});

export type OfferedChoices = z.infer<typeof offerChoicesInput>;

/**
 * True when the last step holds a successful offer-choices result, never for a refused call.
 * Not `hasToolCall`: it also stops after a refused call, so the model could not fix its input (P16d-6).
 */
export const choicesOffered: StopCondition<ToolSet> = ({ steps }) =>
  steps
    .at(-1)
    ?.toolResults.some((result) => result.toolName === OFFER_CHOICES) ?? false;
