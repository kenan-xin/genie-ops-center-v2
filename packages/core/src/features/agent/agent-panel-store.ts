"use client";

import { useEffect, useId } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { AgentPageContext } from "../../services/agent/page-context.ts";

/** What a page tells the agent panel (AG9): its page context, names and ids only (I20). */
export type AgentPage = {
  readonly context?: AgentPageContext;
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
  /** A message a page asked to send, with the record it was sent for, until the chat sent it. */
  readonly outbox: { readonly text: string; readonly record: string } | null;
  /** The Agent button that opened the panel, so Close gives it focus back. */
  readonly opener: HTMLElement | null;
  /**
   * The page the person left out of the chat, by its hook and its context; it stays out until the
   * page publishes another context or another page registers.
   */
  readonly leftOut: { readonly owner: string; readonly key: string } | null;
};

const CLOSED: AgentPanelState = {
  open: false,
  working: false,
  page: null,
  outbox: null,
  opener: null,
  leftOut: null,
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

/** True while the person left the current page out of the chat. */
export function pageLeftOut(state: AgentPanelState): boolean {
  const { page, leftOut } = state;

  return (
    page !== null &&
    leftOut !== null &&
    leftOut.owner === page.owner &&
    leftOut.key === JSON.stringify(page.context)
  );
}

/** Leaves the current page out of every message until it shows something else. */
export function leaveOutPage(): void {
  const { page } = agentPanelStore.getState();

  if (page === null) return;

  agentPanelStore.setState({
    leftOut: { owner: page.owner, key: JSON.stringify(page.context) },
  });
}

/** The context that the next message sends: none when the person left this page out. */
export function sentPageContext(): AgentPageContext | undefined {
  const state = agentPanelStore.getState();

  return pageLeftOut(state) ? undefined : state.page?.context;
}

/** The record a page shows, as one comparable key; "" beside a list or on no page. */
function recordOf(page: AgentPage | null): string {
  const record = page?.context?.record;

  return record === undefined ? "" : `${record.type}:${record.id}`;
}

/**
 * Sets the page. A queued message waits while an answer streams; if the person moved to another
 * record meanwhile, it is dropped, so it never changes a record it was not sent for.
 */
function setPage(page: AgentPanelState["page"]): void {
  const { outbox } = agentPanelStore.getState();

  agentPanelStore.setState(
    outbox !== null && outbox.record !== recordOf(page)
      ? { page, outbox: null }
      : { page }
  );
}

/** Opens the panel and sends `text` once the chat is free. */
function sendToPanel(text: string): void {
  const record = recordOf(agentPanelStore.getState().page);

  agentPanelStore.setState({ open: true, outbox: { text, record } });
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
    setPage({ ...page, owner });
  });

  useEffect(
    () => () => {
      if (agentPanelStore.getState().page?.owner === owner) {
        setPage(null);
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
