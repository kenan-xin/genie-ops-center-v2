"use client";

import type {
  AgentArtifact,
  AgentMessage,
  AgentSessionSummary,
  ChatLabels,
  InboxLink,
} from "@genie/core";
import {
  AgentChat,
  type ArtifactRef,
  AskScreen,
} from "@genie/core/features/agent";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation.js";
import { useEffect, useRef, useState } from "react";

import { rpc } from "../../../../rpc/client.ts";

const SESSION_LIST_KEY = ["agent", "sessions"];

const NO_INBOX: readonly InboxLink[] = [];

/**
 * The browser half of Ask (R-42, R-42a, R-45a, R-18, R-20). The server has read the list, the
 * current session and its artifacts, and refused an unpermitted visitor before this mounts; the
 * client owns the new chat's id, the shown artifact, and the refresh an answer earns.
 */
export function AskRoute(props: {
  readonly sessions: readonly AgentSessionSummary[];
  readonly currentId: string | undefined;
  readonly title: string;
  readonly initialMessages: readonly AgentMessage[];
  readonly initialArtifacts: readonly AgentArtifact[];
  /** The artifact the address names, at its latest version (AG12). */
  readonly initialShown: ArtifactRef | null;
  readonly models: {
    readonly allowed: readonly string[];
    readonly chatDefault: string | null;
  } | null;
  readonly labels: ChatLabels;
  readonly suggestions: readonly string[];
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
  const [newId, setNewId] = useState(() => crypto.randomUUID());
  // The first answer names the new chat in the address without a load, so the chat stays mounted
  // and a question typed meanwhile stays in the composer (czjw.87).
  const [named, setNamed] = useState(false);
  const currentId = props.currentId ?? (named ? newId : undefined);
  const sessionId = currentId ?? newId;

  const title =
    sessions.data.find(({ id }) => id === currentId)?.title ?? props.title;

  const artifactsKey = ["agent", "artifacts", sessionId];

  // Read again on each visit and when an answer ends: the panel can add versions to this chat
  // while Ask is not shown, and a cached list from an earlier visit would hide them. The app's
  // default stale time (30 s) would skip the read on a quick return, so this list sets its own.
  const artifacts = useQuery({
    queryKey: artifactsKey,
    queryFn: () => rpc.agent.artifacts({ id: sessionId }),
    initialData: props.currentId === undefined ? [] : props.initialArtifacts,
    staleTime: 0,
  });

  const [shown, setShown] = useState(props.initialShown);

  // The rail's New chat is a link to /ask, which can keep this mount after the address named the
  // chat. Compare with the last path: the render that sets `named` can still read /ask.
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  useEffect(() => {
    const changed = lastPath.current !== pathname;

    lastPath.current = pathname;

    if (changed && pathname === "/ask" && named) {
      setNamed(false);
      setNewId(crypto.randomUUID());
      setShown(null);
    }
  }, [pathname, named]);

  return (
    <AskScreen
      sessions={sessions.data}
      currentId={currentId}
      title={title}
      sessionHref={(id) => `/ask/${id}`}
      newChatHref="/ask"
      inbox={props.inbox}
      aiOn={props.aiOn}
      timeZone={props.timeZone}
      datasetTitles={props.labels.datasets}
      artifacts={artifacts.data}
      shown={shown}
      onShow={setShown}
    >
      {props.aiOn ? (
        <AgentChat
          key={sessionId}
          sessionId={sessionId}
          initialMessages={props.initialMessages}
          models={props.models}
          labels={props.labels}
          suggestions={props.suggestions}
          // The chat history holds the inbox lines on Ask.
          inbox={NO_INBOX}
          timeZone={props.timeZone}
          artifacts={{ kind: "panel", shown, onOpen: setShown }}
          headingLevel={2}
          // A fresh id remounts the chat, also when the address is already /ask.
          onNewChat={() => {
            setNamed(false);
            setNewId(crypto.randomUUID());
            setShown(null);
            router.push("/ask");
          }}
          onFinished={(id) => {
            void queryClient.invalidateQueries({ queryKey: SESSION_LIST_KEY });
            void queryClient.invalidateQueries({
              queryKey: ["agent", "artifacts", id],
            });

            // The first answer makes the session real, so the address can name it (P3). Next.js
            // syncs its router with this call and loads no page, so the chat is not drawn again.
            if (currentId === undefined) {
              setNamed(true);
              window.history.replaceState(null, "", `/ask/${id}`);
            }
          }}
        />
      ) : null}
    </AskScreen>
  );
}
