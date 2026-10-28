export type AiState = "on" | "no-key" | "no-models";

/** The one AI state rule (R-20): `modelFor`, `modelStatus` and the settings read share it. */
export function aiStateOf(input: {
  readonly keyStored: boolean;
  readonly chatModel: string | null;
  readonly documentModel: string | null;
}): AiState {
  if (!input.keyStored) return "no-key";

  return input.chatModel === null || input.documentModel === null
    ? "no-models"
    : "on";
}
