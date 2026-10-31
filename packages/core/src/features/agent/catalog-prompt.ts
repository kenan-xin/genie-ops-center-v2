import {
  ANSWER_PROMPT_OPTIONS,
  type AnswerViews,
  answerLibrary,
} from "./catalog.ts";

const rendersNothing = () => null;

/** Views that draw nothing: the catalog for the prompt, and for a test that parses an answer. */
export const PROMPT_VIEWS: AnswerViews = {
  Answer: rendersNothing,
  Heading: rendersNothing,
  Paragraph: rendersNothing,
  List: rendersNothing,
  Chart: rendersNothing,
};

/**
 * The catalog part of the agent's system prompt (Spec 7 R-45, P9). It is built at development
 * time into `services/agent/catalog-prompt.generated.ts`, because a route handler must not import
 * `react-lang`: the prompt depends only on names, descriptions and props.
 */
export function catalogPrompt(): string {
  return answerLibrary(PROMPT_VIEWS).prompt(ANSWER_PROMPT_OPTIONS);
}
