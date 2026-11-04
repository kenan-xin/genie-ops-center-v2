"use client";

import { useEffect, useId } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { AgentChatContext } from "./transport.ts";

/** What a page tells the agent panel (AG9): the first shape of the page context seam. */
export type AgentPage = {
  readonly context?: AgentChatContext;
  readonly about?: string;
  readonly suggestions?: readonly string[];
  readonly onFinished?: () => void;
};

type AgentPanelState = {
  readonly open: boolean;
  /** An answer streams, also while the panel is closed. */
  readonly working: boolean;
  /** The page that registered last, by the id of its hook; null on a page with none. */
  readonly page: (AgentPage & { readonly owner: string }) | null;
  /** A message a page asked to send, until the chat sent it. */
  readonly outbox: string | null;
  /** The Agent button that opened the panel, so Close gives it focus back. */
  readonly opener: HTMLElement | null;
};

const CLOSED: AgentPanelState = {
  open: false,
  working: false,
  page: null,
  outbox: null,
  opener: null,
};

/** The one panel of the tab. */
export const agentPanelStore = createStore<AgentPanelState>()(() => CLOSED);

/** For stories and tests, which share the module between runs. */
export function resetAgentPanel(): void {
  agentPanelStore.setState(CLOSED, true);
}

export function setPanelOpen(open: boolean): void {
  agentPanelStore.setState({ open });
}

export function setPanelWorking(working: boolean): void {
  agentPanelStore.setState({ working });
}

/** Opens the panel and sends `text` once the chat is free. */
function sendToPanel(text: string): void {
  agentPanelStore.setState({ open: true, outbox: text });
}

export type AgentPageHandle = {
  readonly open: boolean;
  readonly send: (text: string) => void;
};

/**
 * A page's one way to the agent panel (AG9). The panel reads the latest page when a message goes,
 * and forgets it when the page unmounts, so the next page's message names no stale record.
 */
export function useAgentPage(page: AgentPage): AgentPageHandle {
  const owner = useId();

  // Each render, so a new name, list or callback reaches the panel. The page reads only `open`,
  // so this write never draws the page again.
  useEffect(() => {
    agentPanelStore.setState({ page: { ...page, owner } });
  });

  useEffect(
    () => () => {
      if (agentPanelStore.getState().page?.owner === owner) {
        agentPanelStore.setState({ page: null });
      }
    },
    [owner]
  );

  const open = useStore(agentPanelStore, (state) => state.open);

  return { open, send: sendToPanel };
}

export type AgentPanelHandle = {
  readonly open: boolean;
  readonly working: boolean;
  readonly setOpen: (open: boolean) => void;
};

export function useAgentPanel(): AgentPanelHandle {
  const open = useStore(agentPanelStore, (state) => state.open);
  const working = useStore(agentPanelStore, (state) => state.working);

  return { open, working, setOpen: setPanelOpen };
}
