"use client";

import { Button, Disclosure, focusRing } from "@genie/ui";
import { PlusIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import type {
  AgentSessionSummary,
  InboxLink,
} from "../../services/agent/index.ts";
import { ChatDock } from "./chat-dock.tsx";
import { ChatPanel } from "./chat-panel.tsx";
import { SessionList } from "./session-list.tsx";

/** The `sessionStorage` key that holds the bubble's current chat for this browser tab. */
export const BUBBLE_SESSION_KEY = "genie.chat-bubble.session";

const linkClass = `text-sm font-medium text-foreground underline-offset-4 hover:underline ${focusRing}`;

/** The new chat's welcome: what Ask answers from, and where documents go in (R-42). */
function Welcome(props: { readonly inbox: readonly InboxLink[] }): ReactNode {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center rounded-md border border-border bg-muted"
      >
        <SparklesIcon className="size-3.5" strokeWidth={1.75} />
      </span>
      <div className="grid gap-1 text-sm">
        <p>Ask about the records you can see.</p>
        {props.inbox.map((link) => (
          <p key={link.href} className="text-muted-foreground">
            To add documents, use{" "}
            <a href={link.href} className={linkClass}>
              {link.label}
            </a>
            .
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * The general chat of every signed-in page (R-42, Section 7 redesign P7): a `ChatDock` with the
 * "Ask" panel, New chat and Open Ask in its header, the person's chats in a closed fold, and the
 * conversation. Reopening continues the last chat of this browser tab, also after a page load,
 * and only New chat starts a new session (`czjw.60`). The history list is the one Ask shows.
 * The panel sends no page context, so it carries no "About ..." line (recorded requests).
 */
export function ChatBubble(props: {
  readonly askHref: string;
  readonly sessionHref: (id: string) => string;
  readonly inbox: readonly InboxLink[];
  /** undefined while the list loads. */
  readonly sessions: readonly AgentSessionSummary[] | undefined;
  /** The tenant's zone for each chat's day. */
  readonly timeZone: string;
  readonly onOpenChange?: (open: boolean) => void;
  /** Renders the conversation of a session, with the welcome to show while it is empty. */
  readonly conversation: (sessionId: string, empty: ReactNode) => ReactNode;
}): ReactNode {
  // The browser makes the id of a chat (P3). The tab keeps it, so a page load reopens the same chat.
  const [sessionId, setSessionId] = useState(
    () =>
      globalThis.sessionStorage?.getItem(BUBBLE_SESSION_KEY) ??
      crypto.randomUUID()
  );

  useEffect(() => {
    sessionStorage.setItem(BUBBLE_SESSION_KEY, sessionId);
  }, [sessionId]);

  return (
    <ChatDock label="Ask" onOpenChange={props.onOpenChange}>
      {(close) => (
        <ChatPanel
          title="Ask"
          onClose={close}
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSessionId(crypto.randomUUID())}
              >
                <PlusIcon aria-hidden="true" strokeWidth={1.75} />
                New chat
              </Button>
              <a href={props.askHref} className={`px-2 ${linkClass}`}>
                Open Ask
              </a>
            </>
          }
        >
          <div className="shrink-0 border-b border-border px-4 py-2 text-sm font-medium md:px-5 [&>div>button]:min-h-8">
            <Disclosure summary="Chats">
              <div className="max-h-60 overflow-y-auto pt-1 pb-2">
                {props.sessions === undefined ? (
                  <p className="text-sm text-muted-foreground">
                    Loading chats…
                  </p>
                ) : (
                  <SessionList
                    sessions={props.sessions}
                    sessionHref={props.sessionHref}
                    timeZone={props.timeZone}
                  />
                )}
              </div>
            </Disclosure>
          </div>
          <div key={sessionId} className="flex min-h-0 flex-1 flex-col">
            {props.conversation(sessionId, <Welcome inbox={props.inbox} />)}
          </div>
        </ChatPanel>
      )}
    </ChatDock>
  );
}
