"use client";

import { buttonVariants, Disclosure } from "@genie/ui";
import { PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { AgentSessionSummary } from "../../services/agent/index.ts";
import { SessionList } from "./session-list.tsx";

/**
 * The Ask screen (R-42, P15): the person's sessions as a 280 px column from `lg`, a closed
 * disclosure above the chat below it, New chat, and the conversation beside the list; a new
 * chat's empty state holds the inbox lines. With AI off the conversation is replaced by the off message (R-20).
 * The conversation is the page's own chat, so the shell hides its chat button here (5.4).
 */
export function AskScreen(props: {
  readonly sessions: readonly AgentSessionSummary[];
  readonly currentId: string | undefined;
  readonly sessionHref: (id: string) => string;
  readonly newChatHref: string;
  readonly aiOn: boolean;
  /** The tenant's zone for each chat's day. */
  readonly timeZone: string;
  readonly children: ReactNode;
}): ReactNode {
  const list = (
    <div className="grid gap-3">
      <a
        href={props.newChatHref}
        className={buttonVariants({ variant: "secondary" })}
      >
        <PlusIcon aria-hidden="true" strokeWidth={1.75} />
        New chat
      </a>
      <SessionList
        sessions={props.sessions}
        currentId={props.currentId}
        sessionHref={props.sessionHref}
        timeZone={props.timeZone}
      />
    </div>
  );

  return (
    // Fills a `data-page-fill` page: the list and the conversation scroll, the composer stays at
    // the bottom (agent-native rule 1).
    <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
      <div className="shrink-0 lg:hidden">
        <Disclosure summary="Chats">
          <div className="max-h-80 overflow-y-auto">{list}</div>
        </Disclosure>
      </div>
      <aside className="hidden lg:block lg:w-70 lg:shrink-0 lg:overflow-y-auto">
        {list}
      </aside>
      <section
        data-page-chat=""
        aria-label="Conversation"
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
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
