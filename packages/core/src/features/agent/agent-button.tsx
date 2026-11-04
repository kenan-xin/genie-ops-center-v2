"use client";

import { Button } from "@genie/ui";
import type { ReactNode } from "react";
import { useStore } from "zustand";

import { agentPanelStore } from "./agent-panel-store.ts";

/**
 * Opens and closes the agent panel (R-42, AG10). The dot is still while the agent waits, and
 * pulses while it works; with the panel closed the button also says "Working".
 */
export function AgentButton(): ReactNode {
  const open = useStore(agentPanelStore, (state) => state.open);
  const working = useStore(agentPanelStore, (state) => state.working);

  const workingOutOfSight = working && !open;

  return (
    <Button
      type="button"
      variant="ghost"
      size="filter"
      aria-label={workingOutOfSight ? "Agent, working" : "Agent"}
      aria-expanded={open}
      onClick={(event) =>
        agentPanelStore.setState({ open: !open, opener: event.currentTarget })
      }
    >
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${working ? "bg-primary motion-safe:animate-pulse" : "bg-muted-foreground"}`}
      />
      Agent
      {workingOutOfSight ? (
        <span className="text-muted-foreground">· Working</span>
      ) : null}
    </Button>
  );
}
