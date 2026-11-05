"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";

import { useModuleClient } from "../../lib/rpc/module-client.tsx";
import { agentContract } from "../../services/agent/contract.ts";
import type {
  AgentMessage,
  ChatLabels,
  InboxLink,
} from "../../services/agent/index.ts";
import type { AgentPageContext } from "../../services/agent/page-context.ts";
import type { ArtifactCardAction } from "./artifact-card.tsx";
import type { CheckChart } from "./chart-check.tsx";
import { Conversation } from "./conversation.tsx";
import { AGENT_ROUTE, agentTransport } from "./transport.ts";

const FILE_POLL_MS = 2000;

/**
 * The one wiring of an agent chat (duplicates 2 and 7): the route's transport with the page's
 * context read at send time, the chart gate and the saved messages through the app's `agent`
 * client, and the `Conversation`. Both frames, the agent panel and Ask, render this; only the
 * frame's props differ.
 */
export function AgentChat(props: {
  readonly sessionId: string;
  /** Ask passes the server's messages; the panel leaves it out, and AgentChat loads them (`agent.messages`). */
  readonly initialMessages?: readonly AgentMessage[];
  readonly context?: () => AgentPageContext | undefined;
  readonly models: {
    readonly allowed: readonly string[];
    readonly chatDefault: string | null;
  } | null;
  readonly labels: ChatLabels;
  readonly suggestions: readonly string[];
  readonly inbox: readonly InboxLink[];
  readonly timeZone: string;
  readonly artifacts: ArtifactCardAction;
  /** The empty state's heading. */
  readonly headingLevel: 2 | 3;
  readonly onNewChat: () => void;
  readonly onFinished?: ((sessionId: string) => void) | undefined;
  readonly onWorking?: ((working: boolean) => void) | undefined;
  /** A message the page sends from outside the chat, once; see `Conversation`. */
  readonly pending?:
    | { readonly text: string; readonly onSent: () => void }
    | undefined;
}): ReactNode {
  const agent = useModuleClient(agentContract);

  // The getter is read through a ref, so the transport made once still sees the latest page.
  const context = useRef(props.context);

  context.current = props.context;

  const [transport] = useState(() =>
    agentTransport(AGENT_ROUTE, { context: () => context.current?.() })
  );

  const checkChart: CheckChart = (config) => agent.chart({ config });

  // A chat the panel reopens is read fresh each time, so it continues after a page load (czjw.60).
  const saved = useQuery({
    queryKey: ["agent", "messages", props.sessionId],
    queryFn: () => agent.messages({ id: props.sessionId }),
    enabled: props.initialMessages === undefined,
    gcTime: 0,
    // The app's default stale time (30 s) would answer a quick reopen from the first open's read.
    staleTime: 0,
  });

  // The chat's list files: read again when an answer ends, and every 2 s while one is being made.
  const files = useQuery({
    queryKey: ["agent", "files", props.sessionId],
    queryFn: () => agent.files({ id: props.sessionId }),
    refetchInterval: (query) =>
      query.state.data?.some(
        ({ state }) => state === "queued" || state === "running"
      ) === true
        ? FILE_POLL_MS
        : false,
  });

  // `Conversation` takes its messages once, so it waits for this mount's own read.
  const messages =
    props.initialMessages ??
    (saved.isFetchedAfterMount ? saved.data : undefined);

  if (messages === undefined) {
    return saved.isError ? (
      <p role="alert" className="p-4 text-sm text-muted-foreground">
        This chat could not load. Start a new chat.
      </p>
    ) : null;
  }

  return (
    <Conversation
      key={props.sessionId}
      sessionId={props.sessionId}
      initialMessages={messages}
      transport={transport}
      models={props.models}
      labels={props.labels}
      suggestions={props.suggestions}
      inbox={props.inbox}
      checkChart={checkChart}
      timeZone={props.timeZone}
      artifacts={props.artifacts}
      headingLevel={props.headingLevel}
      onNewChat={props.onNewChat}
      onWorking={props.onWorking}
      pending={props.pending}
      onFinished={(sessionId) => {
        void files.refetch();
        props.onFinished?.(sessionId);
      }}
      files={files.data}
      onDownload={async (id) => (await agent.fileLink({ id })).url}
    />
  );
}
