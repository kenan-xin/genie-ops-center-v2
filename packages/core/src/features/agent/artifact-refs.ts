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
  /** The call's raw panel config, which the gate parses when a table card reads its first rows. */
  readonly config: unknown;
};

/** The latest version of one artifact of the chat, or null when the chat has no such artifact. */
export function latestRef(
  artifacts: readonly { readonly id: string; readonly latestVersion: number }[],
  artifactId: string | undefined
): ArtifactRef | null {
  const artifact = artifacts.find((item) => item.id === artifactId);

  return artifact === undefined
    ? null
    : { artifactId: artifact.id, version: artifact.latestVersion };
}

const cardData = z.object({
  artifactId: z.uuid(),
  version: z.number().int().positive(),
});

const callInput = z.object({
  // Loose, so the series stay on the config that a table card sends to the gate.
  config: z.looseObject({ type: z.string(), title: z.string() }),
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
        config,
      },
    ];
  });
}
