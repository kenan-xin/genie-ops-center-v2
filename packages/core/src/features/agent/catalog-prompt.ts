import { ANSWER_PROMPT_OPTIONS, answerLibrary } from "./catalog.ts";

const rendersNothing = () => null;

/**
 * The catalog part of the agent's system prompt (Spec 7 R-45, P9). It is built at development
 * time into `services/agent/catalog-prompt.generated.ts`, because a route handler must not import
 * `react-lang`: the prompt depends only on names, descriptions and props.
 */
export function catalogPrompt(): string {
  return answerLibrary({
    Answer: rendersNothing,
    Heading: rendersNothing,
    Paragraph: rendersNothing,
    List: rendersNothing,
    Chart: rendersNothing,
  }).prompt(ANSWER_PROMPT_OPTIONS);
}
