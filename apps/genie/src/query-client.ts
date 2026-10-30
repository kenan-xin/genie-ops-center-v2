import { environmentManager, QueryClient } from "@tanstack/react-query";

/** The browser's one client, made on first use. */
let browserClient: QueryClient | undefined;

function makeClient(): QueryClient {
  // Above zero, so a value that arrived with the document is not refetched the moment it is read.
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  });
}

/**
 * The query client of one render (TanStack "Advanced Server Rendering", read 2026-10-30). The
 * server makes a new client for every request: one process serves every person of the deployment,
 * and a shared cache would hand one person's data, such as their Ask sessions, to the next
 * person's server render. The browser keeps one client outside React state, so a suspended first
 * render does not discard it and start again.
 */
export function queryClient(): QueryClient {
  if (environmentManager.isServer()) return makeClient();

  browserClient ??= makeClient();

  return browserClient;
}
