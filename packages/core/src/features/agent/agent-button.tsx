"use client";

import { Button } from "@genie/ui";
import { SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "zustand";

import { agentPanelStore } from "./agent-panel-store.ts";

/**
 * Opens and closes the agent panel (R-42, AG10). From `md` it shows a dot and "Ask": the dot is
 * still while the agent waits and pulses while it works, and with the panel closed the button also
 * says "Working". Under `md` every top bar shows the Sparkles icon instead, with the dot on the
 * button's top-right corner, outside the glyph (deck-phone.prototype.html, czjw.177).
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
      // 44 px wide under `md`; the `aria-label` keeps the name while the word hides.
      className="max-md:w-11"
      aria-label={workingOutOfSight ? "Ask, working" : "Ask"}
      aria-expanded={open}
      onClick={(event) =>
        agentPanelStore.setState({ open: !open, opener: event.currentTarget })
      }
    >
      {/* 17 px, so that its drawn height matches the 20 px Undo glyph beside it. */}
      <SparklesIcon
        aria-hidden="true"
        strokeWidth={1.75}
        className="size-4.25 md:hidden"
      />
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full max-md:absolute max-md:top-1.25 max-md:right-1 max-md:ring-2 max-md:ring-background ${working ? "bg-primary motion-safe:animate-pulse" : "bg-muted-foreground"}`}
      />
      <span className="max-md:hidden">Ask</span>
      {workingOutOfSight ? (
        <span className="text-muted-foreground max-md:hidden">· Working</span>
      ) : null}
    </Button>
  );
}
