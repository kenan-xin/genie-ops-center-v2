import type { AgentRunStatus } from "@genie/core/features/agent/panel";

/** The run builds or stops, so the agent may still change the deck. */
export function isDrafting(run: AgentRunStatus | null): boolean {
  return run === "building" || run === "stopping";
}

export const slideCount = (count: number) =>
  count === 1 ? "1 slide" : `${count} slides`;

/**
 * The deck page's pill while the agent drafts, and once after the run ended in front of the
 * person. The page does not know the planned count (owner, OQ-2 option b), so it names the slide in
 * work. A `stopped` run reads the same from Stop, the time box and the loop guard (DEC-57).
 */
export function draftStatus(input: {
  readonly run: AgentRunStatus | null;
  readonly endedHere: boolean;
  readonly drafted: number;
}): string | null {
  const { run, endedHere, drafted } = input;

  if (run === "building") return `Drafting slide ${drafted + 1}`;

  if (run === "stopping") return "Stopping";

  if (!endedHere) return null;

  if (run === "saved") return `${slideCount(drafted)} drafted`;

  if (run === "stopped") return `Stopped, ${slideCount(drafted)} kept`;

  if (run === "failed" || run === "interrupted") {
    return `Drafting did not finish. ${slideCount(drafted)} drafted`;
  }

  return null;
}

/**
 * The deck still has the title its start gave it, the chat's, while the agent may rename it. After
 * any end the title shows as it is, so a run that never renamed leaves no loading title (Review
 * Focus 5). A deck handed over from Ask already has the brief's title, which the chat shares.
 */
export function isUnnamed(input: {
  readonly run: AgentRunStatus | null;
  readonly title: string;
  readonly sessionTitle: string | null;
  readonly handedOver: boolean;
}): boolean {
  return (
    isDrafting(input.run) &&
    !input.handedOver &&
    input.title === input.sessionTitle
  );
}
