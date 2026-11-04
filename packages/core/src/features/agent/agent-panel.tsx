"use client";

import { useState, type ReactNode } from "react";

import type { AgentMessage, ChatLabels } from "../../services/agent/index.ts";
import { AgentChat } from "./agent-chat.tsx";
import type { AgentChatContext } from "./transport.ts";

const NO_MESSAGES: readonly AgentMessage[] = [];

/**
 * A new agent chat beside one record or one list (R-49, S7-13). Beside a record, every message
 * names it, so the prompt tells the model what "this" means; beside a list, no context is sent.
 * Each mount starts its own session (P3), and New chat starts another. Task 9 replaces it with the
 * shell's agent panel.
 */
export function AgentPanel(props: {
  readonly context?: AgentChatContext;
  readonly models: {
    readonly allowed: readonly string[];
    readonly chatDefault: string | null;
  } | null;
  readonly labels: ChatLabels;
  readonly suggestions: readonly string[];
  readonly timeZone: string;
  /** A message the page sends from outside the chat, once; see `Conversation`. */
  readonly pending?:
    | { readonly text: string; readonly onSent: () => void }
    | undefined;
  readonly onFinished?: () => void;
}): ReactNode {
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());

  const { context } = props;

  return (
    <AgentChat
      sessionId={sessionId}
      initialMessages={NO_MESSAGES}
      context={() => context}
      models={props.models}
      labels={props.labels}
      suggestions={props.suggestions}
      inbox={[]}
      timeZone={props.timeZone}
      artifacts={{
        kind: "link",
        href: (ref) => `/ask/${sessionId}?artifact=${ref.artifactId}`,
      }}
      headingLevel={3}
      onNewChat={() => setSessionId(crypto.randomUUID())}
      pending={props.pending}
      onFinished={() => props.onFinished?.()}
    />
  );
}
