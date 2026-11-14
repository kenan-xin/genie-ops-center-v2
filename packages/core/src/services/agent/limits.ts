/**
 * The route's limits (P8): one bounded turn per request, never retried. In a file of its own, so
 * the run job reads them at load time without importing the route (`chat.ts` imports the tools,
 * and `hand-over` imports the run job).
 */
export const AGENT_LIMITS = {
  requestBytes: 64 * 1024,
  messageCharacters: 4000,
  steps: 10,
  turnMs: 180_000,
} as const;

/** How many runs one person may have working at once (DEC-57). */
export const AGENT_RUNS_PER_PERSON = 3;

/** A run ends at this many identical tool calls in a row (DEC-57 item 3, R11). */
export const LOOP_REPEATS = 3;
