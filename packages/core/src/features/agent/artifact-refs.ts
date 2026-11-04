import { z } from "zod";

import type { AgentMessage } from "../../services/agent/index.ts";

/**
 * The artifact cards of an answer (AG4, AG24): each `data-artifact` part names an artifact version,
 * and the `make-artifact` call with the same id holds its kind and title. A card part whose data
 * is not a version reference, or that has no call beside it, shows no card.
 */

export type ArtifactRef = {
  readonly artifactId: string;
  readonly version: number;
};

export type CardArtifact = ArtifactRef & {
  readonly toolCallId: string;
  readonly kind: "chart" | "table";
  readonly title: string;
};

const cardData = z.object({
  artifactId: z.uuid(),
  version: z.number().int().positive(),
});

const callInput = z.object({
  config: z.object({ type: z.string(), title: z.string() }),
});

export function artifactRefsOf(message: AgentMessage): readonly CardArtifact[] {
  const calls = new Map(
    message.parts.flatMap((part) => {
      if (part.type !== "tool-make-artifact" || !("input" in part)) return [];

      const input = callInput.safeParse(part.input);

      return input.success
        ? [[part.toolCallId, input.data.config] as const]
        : [];
    })
  );

  return message.parts.flatMap((part) => {
    if (part.type !== "data-artifact" || part.id === undefined) return [];

    const data = cardData.safeParse(part.data);

    const config = calls.get(part.id);

    if (!data.success || config === undefined) return [];

    return [
      {
        ...data.data,
        toolCallId: part.id,
        kind: config.type === "table" ? ("table" as const) : ("chart" as const),
        title: config.title,
      },
    ];
  });
}
