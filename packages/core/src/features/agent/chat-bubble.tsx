"use client";

import {
  Button,
  focusRing,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@genie/ui";
import { MessageCircleIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import type {
  AgentSessionSummary,
  InboxLink,
} from "../../services/agent/index.ts";

const linkClass = `text-sm font-medium text-foreground underline-offset-4 hover:underline ${focusRing}`;

const sessionClass = `flex min-h-10 items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground ${focusRing}`;

/**
 * The chat bubble at the bottom right of every signed-in page (R-42, P15). It opens a Sheet from
 * the right, full width on phones, with a new chat, the person's sessions, the Documents inbox
 * links and Open Ask. Every open starts a new session (B11.1), while the history list is the same
 * one Ask shows.
 */
export function ChatBubble(props: {
  readonly askHref: string;
  readonly sessionHref: (id: string) => string;
  readonly inbox: readonly InboxLink[];
  /** undefined while the list loads. */
  readonly sessions: readonly AgentSessionSummary[] | undefined;
  readonly onOpenChange?: (open: boolean) => void;
  /** Renders the conversation of a new session; called with a new id each time the bubble opens. */
  readonly conversation: (sessionId: string) => ReactNode;
}): ReactNode {
  const [open, setOpen] = useState(false);

  // The browser makes the id of a chat (P3), and one new id starts each open (B11.1).
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());

  function startNewChat(): void {
    setSessionId(crypto.randomUUID());
  }

  function changeOpen(next: boolean): void {
    if (next) startNewChat();

    setOpen(next);
    props.onOpenChange?.(next);
  }

  return (
    <>
      <Button
        type="button"
        aria-label="Open Ask"
        size="icon"
        // oxlint-disable-next-line shadcn/no-restyle -- P15 calls for the round trigger; the design review (buv3.20) owns the shape.
        className="fixed right-4 bottom-20 z-40 rounded-full lg:bottom-4"
        onClick={() => changeOpen(true)}
      >
        <MessageCircleIcon aria-hidden="true" />
      </Button>
      <Sheet open={open} onOpenChange={changeOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Ask</SheetTitle>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
            <div className="flex flex-wrap items-center gap-4">
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={startNewChat}
              >
                New chat
              </Button>
              <a href={props.askHref} className={linkClass}>
                Open Ask
              </a>
            </div>

            {props.sessions === undefined ? (
              <p className="text-sm text-muted-foreground">Loading chats…</p>
            ) : props.sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No chats yet.</p>
            ) : (
              <nav aria-label="Chats">
                <ul className="grid gap-1">
                  {props.sessions.map((session) => (
                    <li key={session.id}>
                      <a
                        href={props.sessionHref(session.id)}
                        className={sessionClass}
                      >
                        <span className="line-clamp-1">{session.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {props.inbox.map((link) => (
              <p key={link.href} className="text-sm text-muted-foreground">
                To add documents, use{" "}
                <a href={link.href} className={linkClass}>
                  {link.label}
                </a>
                .
              </p>
            ))}

            <section
              aria-label="Conversation"
              className="border-t border-border pt-5"
            >
              <div key={sessionId}>{props.conversation(sessionId)}</div>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
