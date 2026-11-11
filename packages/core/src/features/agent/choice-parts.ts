import {
  OFFER_CHOICES,
  offerChoicesInput,
  type OfferedChoices,
} from "../../services/agent/choices.ts";
import type { AgentMessage } from "../../services/agent/index.ts";
import { toolNameOf } from "../../services/agent/tool-parts.ts";

/**
 * The question and choices of the answer's last `offer-choices` call that the tool accepted
 * (R-46). A refused, streaming or malformed call offers nothing, so it shows no button.
 */
export function choicesOf(message: AgentMessage): OfferedChoices | undefined {
  const offer = message.parts.findLast(
    (part) =>
      toolNameOf(part) === OFFER_CHOICES &&
      "state" in part &&
      part.state === "output-available"
  );

  return offer !== undefined && "input" in offer
    ? offerChoicesInput.safeParse(offer.input).data
    : undefined;
}
