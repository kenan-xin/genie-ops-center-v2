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
