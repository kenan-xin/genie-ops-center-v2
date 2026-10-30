"use client";

import type { AgentMessage, InboxLink } from "@genie/core";
import type { CheckChart } from "@genie/core/features/agent";
import { ChatBubble } from "@genie/core/features/agent/bubble";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState, type ReactNode } from "react";

import { rpc } from "./rpc/client.ts";

const SESSION_LIST_KEY = ["agent", "sessions"];

const NO_MESSAGES: readonly AgentMessage[] = [];

const checkChart: CheckChart = (config) => rpc.agent.chart({ config });

type ConversationProps = {
  readonly sessionId: string;
  readonly models: {
    readonly allowed: readonly string[];
    readonly chatDefault: string | null;
  };
  readonly timeZone: string;
  readonly newChatHref: string;
  readonly onFinished: () => void;
};

/**
 * `Conversation` and the transport arrive in their own chunk, so `react-lang` and Recharts load
 * only after the bubble opens. The transport lives here, in the chunk that owns the agent's
 * browser code, and not in the shell's bundle.
 */
const LazyConversation = lazy(async () => {
  const { agentTransport, Conversation } =
    await import("@genie/core/features/agent");

  return {
    default: function LoadedConversation(props: ConversationProps) {
      const [transport] = useState(() => agentTransport("/api/agent"));

      return (
        <Conversation
          sessionId={props.sessionId}
          initialMessages={NO_MESSAGES}
          transport={transport}
          models={props.models}
          checkChart={checkChart}
          timeZone={props.timeZone}
          newChatHref={props.newChatHref}
          onFinished={props.onFinished}
        />
      );
    },
  };
});

/**
 * The browser half of the bubble (R-42, P6). The server has already refused a person without
 * `core:ask:use` or with AI off. The session list loads only once the bubble opens, and a
 * finished answer refreshes it, so the bubble and Ask list the same sessions.
 */
export function AgentBubbleMount(props: {
  readonly models: {
    readonly allowed: readonly string[];
    readonly chatDefault: string | null;
  };
  readonly inbox: readonly InboxLink[];
  readonly timeZone: string;
}): ReactNode {
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);

  const sessions = useQuery({
    queryKey: SESSION_LIST_KEY,
    queryFn: () => rpc.agent.sessions(),
    enabled: open,
  });

  return (
    <ChatBubble
      askHref="/ask"
      sessionHref={(id) => `/ask/${id}`}
      inbox={props.inbox}
      sessions={sessions.data}
      onOpenChange={setOpen}
      conversation={(sessionId) => (
        <Suspense fallback={null}>
          <LazyConversation
            sessionId={sessionId}
            models={props.models}
            timeZone={props.timeZone}
            newChatHref="/ask"
            onFinished={() => {
              void queryClient.invalidateQueries({
                queryKey: SESSION_LIST_KEY,
              });
            }}
          />
        </Suspense>
      )}
    />
  );
}
