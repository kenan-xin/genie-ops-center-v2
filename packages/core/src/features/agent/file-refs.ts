import { z } from "zod";

import {
  FILE_FORMATS,
  type FileFormat,
} from "../../services/agent/file-kinds.ts";
import type { AgentMessage } from "../../services/agent/index.ts";

/** The file an answer asked for: its `make-file` call, which the file card and the timeline key on. */
export type FileCall = {
  readonly toolCallId: string;
  readonly title: string;
  readonly format: FileFormat;
};

const callInput = z.object({
  title: z.string(),
  format: z.enum(FILE_FORMATS),
});

/** Each `make-file` call of the answer whose input parsed; a call still streaming shows no card. */
export function fileCallsOf(message: AgentMessage): readonly FileCall[] {
  return message.parts.flatMap((part) => {
    if (part.type !== "tool-make-file" || !("input" in part)) return [];

    // A refused call queued nothing, so it has no card; the timeline shows the refusal.
    if (part.state === "output-error") return [];

    const input = callInput.safeParse(part.input);

    return input.success
      ? [{ toolCallId: part.toolCallId, ...input.data }]
      : [];
  });
}
