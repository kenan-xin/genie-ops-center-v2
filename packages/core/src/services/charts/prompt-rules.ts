/**
 * The chart gate rules a model broke most often (czjw.79, I21 cause 2), stated before its first
 * try. The catalog prompt, the make-artifact description and the deck tool descriptions hold them
 * verbatim, so the recordings do.
 */
export const CHART_PROMPT_RULES = [
  "A bar, line or area chart with two or more series runs each series with exactly one group and one aggregate, and with no select, orderBy or limit.",
  "A table that selects a money field also selects the dataset's currency field.",
] as const;
