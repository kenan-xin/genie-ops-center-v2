"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useModuleClient } from "../../lib/rpc/module-client.tsx";
import { agentContract } from "../../services/agent/contract.ts";
import type { HandoffCardData } from "../../services/agent/hand-over.ts";
import type {
  AgentMessage,
  ChatLabels,
  InboxLink,
} from "../../services/agent/index.ts";
import type { AgentPageContext } from "../../services/agent/page-context.ts";
import type { ArtifactCardAction } from "./artifact-card.tsx";
import type { CheckChart } from "./chart-check.tsx";
import { Conversation } from "./conversation.tsx";
import { useSessionDetail } from "./session-detail.ts";
import {
  AGENT_ROUTE,
  agentTransport,
  type SurfaceBinding,
} from "./transport.ts";

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
  /** On a surface's record page, the binding a new chat takes (P11-26). */
  readonly surface?: (() => SurfaceBinding | undefined) | undefined;
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
  /** Each read of a building run that changed its messages, and the read that saw it end. */
  readonly onProgress?: (() => void) | undefined;
  /** An answer handed work over to a surface; see `Conversation`. */
  readonly onHandoff?: ((card: HandoffCardData) => void) | undefined;
  readonly onWorking?: ((working: boolean) => void) | undefined;
  /** The model a frame chooses itself; see `Conversation`. */
  readonly model?:
    | { readonly value: string; readonly onChange: (model: string) => void }
    | undefined;
  /** A message the page sends from outside the chat, once; see `Conversation`. */
  readonly pending?:
    | { readonly text: string; readonly onSent: () => void }
    | undefined;
}): ReactNode {
  const agent = useModuleClient(agentContract);

  // The getters are read through refs, so the transport made once still sees the latest page.
  const context = useRef(props.context);

  context.current = props.context;

  const surface = useRef(props.surface);

  surface.current = props.surface;

  const [transport] = useState(() =>
    agentTransport(AGENT_ROUTE, {
      context: () => context.current?.(),
      surface: () => surface.current?.(),
    })
  );

  const checkChart: CheckChart = (config) => agent.chart({ config });

  // A chat the panel reopens is read fresh each time, so it continues after a page load (czjw.60).
  // The read holds the run, and polls each second while it builds (R-42b, P11-32).
  const saved = useSessionDetail(props.sessionId);

  const stop = useMutation({
    mutationFn: () => agent.stop({ id: props.sessionId }),
    onSettled: () => void saved.refetch(),
  });

  const retry = useMutation({
    mutationFn: () => agent.retry({ id: props.sessionId }),
    onSettled: () => void saved.refetch(),
  });

  const read = saved.data;

  // The page refreshes after each read that changed a building run, and after the read that saw
  // its end, so its record shows new parts without a reload (tech plan "How pages follow a run").
  const followed = useRef<{
    readonly messages: unknown;
    readonly building: boolean;
  } | null>(null);

  const onProgress = useRef(props.onProgress);

  onProgress.current = props.onProgress;

  useEffect(() => {
    if (read === undefined || read === null) return;

    const run = read.session.run;

    const building = run === "building" || run === "stopping";

    const before = followed.current;

    followed.current = { messages: read.messages, building };

    if (
      before !== null &&
      before.messages !== read.messages &&
      (building || before.building)
    ) {
      onProgress.current?.();
    }
  }, [read]);

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
  // An id not saved yet reads null, which is an empty new chat.
  const messages =
    props.initialMessages ??
    (saved.isFetchedAfterMount ? (read?.messages ?? []) : undefined);

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
      onHandoff={props.onHandoff}
      run={
        read === undefined || read === null || read.session.run === null
          ? undefined
          : {
              status: read.session.run,
              messages: read.messages,
              askHref:
                read.session.handedFromSessionId === null
                  ? undefined
                  : `/ask/${read.session.handedFromSessionId}`,
              onStop: () => stop.mutate(),
              onTryAgain: () => retry.mutate(),
            }
      }
      pending={props.pending}
      model={props.model}
      onFinished={(sessionId) => {
        void files.refetch();
        props.onFinished?.(sessionId);
      }}
      files={files.data}
      onDownload={async (id) => (await agent.fileLink({ id })).url}
    />
  );
}
