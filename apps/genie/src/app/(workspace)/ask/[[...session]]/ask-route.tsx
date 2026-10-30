"use client";

import type { AgentMessage, AgentSessionSummary, InboxLink } from "@genie/core";
import {
  agentTransport,
  AskScreen,
  type CheckChart,
  Conversation,
} from "@genie/core/features/agent";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation.js";
import { useState } from "react";

import { rpc } from "../../../../rpc/client.ts";

const SESSION_LIST_KEY = ["agent", "sessions"];

const checkChart: CheckChart = (config) => rpc.agent.chart({ config });

/**
 * The browser half of Ask (R-42, R-18, R-20). The server has read the list and the current
 * session and refused an unpermitted visitor before this mounts; the client owns the new chat's
 * id, the model picker's transport, and the list refresh a first answer earns.
 */
export function AskRoute(props: {
  readonly sessions: readonly AgentSessionSummary[];
  readonly currentId: string | undefined;
  readonly initialMessages: readonly AgentMessage[];
  readonly models: {
    readonly allowed: readonly string[];
    readonly chatDefault: string | null;
  } | null;
  readonly aiOn: boolean;
  readonly inbox: readonly InboxLink[];
  readonly timeZone: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const sessions = useQuery({
    queryKey: SESSION_LIST_KEY,
    queryFn: () => rpc.agent.sessions(),
    initialData: props.sessions,
  });

  // The browser makes the id of a new chat (P3), and one id lasts for this mount.
  const [newId] = useState(() => crypto.randomUUID());
  const sessionId = props.currentId ?? newId;

  const [transport] = useState(() => agentTransport("/api/agent"));

  return (
    <AskScreen
      sessions={sessions.data}
      currentId={props.currentId}
      sessionHref={(id) => `/ask/${id}`}
      newChatHref="/ask"
      inbox={props.inbox}
      aiOn={props.aiOn}
    >
      {props.aiOn ? (
        <Conversation
          key={sessionId}
          sessionId={sessionId}
          initialMessages={props.initialMessages}
          transport={transport}
          models={props.models}
          checkChart={checkChart}
          timeZone={props.timeZone}
          newChatHref="/ask"
          onFinished={(id) => {
            void queryClient.invalidateQueries({ queryKey: SESSION_LIST_KEY });

            // The first answer makes the session real, so the address can name it (P3).
            if (props.currentId === undefined) router.replace(`/ask/${id}`);
          }}
        />
      ) : null}
    </AskScreen>
  );
}
