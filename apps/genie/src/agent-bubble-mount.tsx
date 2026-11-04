"use client";

import type { ChatLabels, InboxLink } from "@genie/core";
import { ChatBubble } from "@genie/core/features/agent/bubble";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState, type ReactNode } from "react";

import { rpc } from "./rpc/client.ts";

const SESSION_LIST_KEY = ["agent", "sessions"];

/**
 * `AgentChat` arrives in its own chunk, so `react-lang` and Recharts load only after the bubble
 * opens. It reads the chat's saved messages fresh on each open, so a reopen continues it (`czjw.60`).
 */
const LazyAgentChat = lazy(async () => ({
  default: (await import("@genie/core/features/agent")).AgentChat,
}));

/**
 * The browser half of the bubble (R-42, P6). The server has already refused a person without
 * `core:ask:use` or with AI off. The session list loads only once the bubble opens, and a
 * finished answer refreshes it, so the bubble and Ask list the same sessions.
 */
export function AgentBubbleMount(props: {
  readonly models: {
    readonly allowed: readonly string[];
    readonly chatDefault: string | null;
  } | null;
  readonly labels: ChatLabels;
  readonly suggestions: readonly string[];
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
      sessions={sessions.data}
      timeZone={props.timeZone}
      onOpenChange={setOpen}
      conversation={(sessionId, newChat) => (
        <Suspense fallback={null}>
          <LazyAgentChat
            sessionId={sessionId}
            models={props.models}
            labels={props.labels}
            suggestions={props.suggestions}
            inbox={props.inbox}
            timeZone={props.timeZone}
            artifacts={{
              kind: "link",
              href: (ref) => `/ask/${sessionId}?artifact=${ref.artifactId}`,
            }}
            headingLevel={3}
            onNewChat={newChat}
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
