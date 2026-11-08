"use client";

import {
  Button,
  buttonVariants,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useMediaQuery,
} from "@genie/ui";
import { PanelLeftIcon, SquarePenIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useModuleClient } from "../../lib/rpc/module-client.tsx";
import { agentContract } from "../../services/agent/contract.ts";
import type {
  AgentArtifact,
  AgentSessionSummary,
} from "../../services/agent/index.ts";
import { ArtifactPanel } from "./artifact-panel.tsx";
import type { ArtifactRef } from "./artifact-refs.ts";
import { ChartCheckProvider } from "./chart-check.tsx";
import { ChatHistory } from "./chat-history.tsx";

/** From this width an open artifact sits in a column beside the chat (AG22). */
const ARTIFACT_DOCKED = "(min-width: 1280px)";

/**
 * The Ask frame (R-42, R-42a, R-45a, AG22): the chat history as a 272 px column from 1024 px that
 * hides fully on its own toggle, and a left sheet below; the chat in the middle; and the artifact
 * panel, a 480 px column from 1280 px and a sheet below, open only when the person opens a card.
 * The chat itself is the shared `AgentChat`, passed as `children`; only this frame is Ask's own.
 */
export function AskScreen(props: {
  readonly sessions: readonly AgentSessionSummary[];
  readonly currentId: string | undefined;
  /** The session title, or "New chat". */
  readonly title: string;
  readonly sessionHref: (id: string) => string;
  readonly newChatHref: string;
  readonly aiOn: boolean;
  /** The tenant's zone for each chat's day. */
  readonly timeZone: string;
  /** Dataset titles by name, for the artifact's source caption. */
  readonly datasetTitles: Readonly<Record<string, string>>;
  readonly artifacts: readonly AgentArtifact[];
  readonly shown: ArtifactRef | null;
  readonly onShow: (ref: ArtifactRef | null) => void;
  readonly children: ReactNode;
}): ReactNode {
  const agent = useModuleClient(agentContract);
  const docked = useMediaQuery(ARTIFACT_DOCKED, {});
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historySheet, setHistorySheet] = useState(false);

  // The toggle moves between the column and the top bar, so focus follows it.
  const hideButton = useRef<HTMLButtonElement>(null);
  const showButton = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);

  useEffect(() => {
    if (!toggled.current) return;

    toggled.current = false;
    (historyOpen ? hideButton : showButton).current?.focus();
  }, [historyOpen]);

  const toggleHistory = (open: boolean) => {
    toggled.current = true;
    setHistoryOpen(open);
  };

  const history = (
    <ChatHistory
      sessions={props.sessions}
      currentId={props.currentId}
      sessionHref={props.sessionHref}
      timeZone={props.timeZone}
    />
  );

  const artifact = (variant: "column" | "sheet") =>
    props.shown === null ? null : (
      <ChartCheckProvider
        check={(config) => agent.chart({ config })}
        timeZone={props.timeZone}
        datasetTitles={props.datasetTitles}
      >
        <ArtifactPanel
          artifacts={props.artifacts}
          shown={props.shown}
          onShow={props.onShow}
          onClose={() => props.onShow(null)}
          variant={variant}
        />
      </ChartCheckProvider>
    );

  return (
    <div className="flex min-h-0 flex-1">
      {historyOpen ? (
        <aside
          aria-label="Chat history"
          className="hidden w-68 shrink-0 flex-col border-e border-border bg-muted lg:flex"
        >
          <div className="flex h-14 shrink-0 items-center gap-1 ps-6 pe-3">
            <h2 className="flex-1 text-sm font-bold">Chats</h2>
            <a
              href={props.newChatHref}
              aria-label="New chat"
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <SquarePenIcon aria-hidden="true" strokeWidth={1.75} />
            </a>
            <Button
              ref={hideButton}
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Hide chats"
              onClick={() => toggleHistory(false)}
            >
              <PanelLeftIcon aria-hidden="true" strokeWidth={1.75} />
            </Button>
          </div>
          {history}
        </aside>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="hidden h-14 shrink-0 items-center gap-2 border-b border-border px-4 lg:flex">
          {historyOpen ? null : (
            <Button
              ref={showButton}
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Show chats"
              onClick={() => toggleHistory(true)}
            >
              <PanelLeftIcon aria-hidden="true" strokeWidth={1.75} />
            </Button>
          )}
          <p className="truncate text-sm font-semibold">{props.title}</p>
        </div>

        {/* Below 1024 px the shell's top bar keeps the main menu; this bar sits under it. */}
        <div className="flex min-h-13 shrink-0 items-center gap-1 border-b border-border px-2 lg:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Show chats"
            onClick={() => setHistorySheet(true)}
          >
            <PanelLeftIcon aria-hidden="true" strokeWidth={1.75} />
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {props.title}
          </p>
          <a
            href={props.newChatHref}
            aria-label="New chat"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <SquarePenIcon aria-hidden="true" strokeWidth={1.75} />
          </a>
        </div>

        <section
          aria-label="Conversation"
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          {props.aiOn ? (
            props.children
          ) : (
            <div
              role="status"
              className="m-4 grid gap-1 rounded-lg border border-border p-4"
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

      {docked ? (
        props.shown === null ? null : (
          <aside
            aria-label="Artifact panel"
            className="flex w-120 shrink-0 flex-col border-s border-border"
          >
            {artifact("column")}
          </aside>
        )
      ) : (
        <Sheet
          open={props.shown !== null}
          onOpenChange={(open) => {
            if (!open) props.onShow(null);
          }}
        >
          <SheetContent
            side="right"
            showCloseButton={false}
            aria-label="Artifact"
            // oxlint-disable-next-line shadcn/no-restyle -- the panel brings its own header and padding
            className="gap-0 overflow-hidden p-0"
          >
            {artifact("sheet")}
          </SheetContent>
        </Sheet>
      )}

      <Sheet open={historySheet} onOpenChange={setHistorySheet}>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Chats</SheetTitle>
          </SheetHeader>
          {history}
        </SheetContent>
      </Sheet>
    </div>
  );
}
