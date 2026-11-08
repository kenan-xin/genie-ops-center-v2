import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { ModuleClientProvider } from "../../../lib/rpc/module-client.tsx";
import type {
  AgentFile,
  AgentMessage,
  AgentSessionSummary,
} from "../../../services/agent/index.ts";
import type { CheckChart } from "../chart-check.tsx";

const NO_MESSAGES: readonly AgentMessage[] = [];

const NO_FILES: readonly AgentFile[] = [];

const noChart: CheckChart = async () => {
  throw new Error("This story draws no chart.");
};

/**
 * The app's `agent` client for a story that renders `AgentChat`: saved messages and the chart gate
 * are fakes, and a fresh query client holds nothing between stories.
 */
export function AgentClientStub(props: {
  readonly messages?: (input: {
    readonly id: string;
  }) => Promise<readonly AgentMessage[]>;
  readonly chart?: CheckChart;
  readonly files?: (input: {
    readonly id: string;
  }) => Promise<readonly AgentFile[]>;
  readonly fileLink?: (input: {
    readonly id: string;
  }) => Promise<{ readonly url: string }>;
  readonly rename?: (input: {
    readonly id: string;
    readonly title: string;
  }) => Promise<AgentSessionSummary>;
  readonly remove?: (input: { readonly id: string }) => Promise<void>;
  readonly children: ReactNode;
}): ReactNode {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );

  const agent = {
    messages: props.messages ?? (async () => NO_MESSAGES),
    chart: ({ config }: { readonly config: unknown }) =>
      (props.chart ?? noChart)(config),
    sessions: async () => [],
    files: props.files ?? (async () => NO_FILES),
    fileLink:
      props.fileLink ??
      (async () => {
        throw new Error("This story downloads no file.");
      }),
    rename:
      props.rename ??
      (async () => {
        throw new Error("This story renames no chat.");
      }),
    remove:
      props.remove ??
      (async () => {
        throw new Error("This story deletes no chat.");
      }),
  };

  return (
    <QueryClientProvider client={client}>
      <ModuleClientProvider client={{ agent }}>
        {props.children}
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}
