"use client";

import { ModuleClientProvider } from "@genie/core/rpc/client";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { queryClient } from "./query-client.ts";
import { rpc } from "./rpc/client.ts";

export function QueryProvider(props: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient()}>
      <ModuleClientProvider client={rpc}>{props.children}</ModuleClientProvider>
    </QueryClientProvider>
  );
}
