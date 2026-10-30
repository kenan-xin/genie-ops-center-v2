"use client";

import { Disclosure, focusRing } from "@genie/ui";
import type { ReactNode } from "react";

import type {
  AgentSessionSummary,
  InboxLink,
} from "../../services/agent/index.ts";

const linkClass = `text-sm font-medium text-foreground underline-offset-4 hover:underline ${focusRing}`;

function sessionClass(current: boolean): string {
  return `flex min-h-10 items-center rounded-md px-2 text-sm ${
    current
      ? "bg-muted font-medium text-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  } ${focusRing}`;
}

/**
 * The Ask screen (R-42, P15): the person's sessions as a 280 px column from `lg`, a closed
 * disclosure above the chat below it, New chat, one inbox link per readable provider, and the
 * conversation beside the list. With AI off the conversation is replaced by the off message (R-20).
 */
export function AskScreen(props: {
  readonly sessions: readonly AgentSessionSummary[];
  readonly currentId: string | undefined;
  readonly sessionHref: (id: string) => string;
  readonly newChatHref: string;
  readonly inbox: readonly InboxLink[];
  readonly aiOn: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const list = (
    <div className="grid gap-3">
      <a href={props.newChatHref} className={linkClass}>
        New chat
      </a>
      {props.sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No chats yet.</p>
      ) : (
        <nav aria-label="Chats">
          <ul className="grid gap-1">
            {props.sessions.map((session) => (
              <li key={session.id}>
                <a
                  href={props.sessionHref(session.id)}
                  aria-current={
                    session.id === props.currentId ? "page" : undefined
                  }
                  className={sessionClass(session.id === props.currentId)}
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
    </div>
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="lg:hidden">
        <Disclosure summary="Chats">{list}</Disclosure>
      </div>
      <aside className="hidden lg:block lg:w-70 lg:shrink-0">{list}</aside>
      <section aria-label="Conversation" className="min-w-0 flex-1">
        {props.aiOn ? (
          props.children
        ) : (
          <div
            role="status"
            className="grid gap-1 rounded-lg border border-border p-4"
          >
            <p className="font-semibold">AI is off.</p>
            <p className="text-sm text-muted-foreground">
              Ask needs a model connection. An administrator turns it on in
              Tenant settings.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
