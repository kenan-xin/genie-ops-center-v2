import { createTRPCClient, httpBatchLink } from "@trpc/client";

import type { AppRouter } from "./root.ts";

/**
 * The browser's one tRPC client. It reaches the application's `/api/trpc` route, which builds the
 * request principal from the real session on every call, so the server re-checks `can()` and the
 * client never decides authorization. No transformer is configured, matching the server, so a
 * value arrives as plain JSON.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api/trpc" })],
});
