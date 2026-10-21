"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * The browser's one query client.
 *
 * A module singleton, created outside `useState`, so a suspended first render
 * does not discard it and start again (the TanStack advanced server rendering
 * guide, read 2026-09-22). `staleTime` is above zero so a value that arrived
 * with the document is not refetched the moment it is read.
 *
 * One client per browser is correct here because one deployment serves one
 * customer: there is no second tenant in this process to keep apart.
 */
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

export function QueryProvider(props: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  );
}
