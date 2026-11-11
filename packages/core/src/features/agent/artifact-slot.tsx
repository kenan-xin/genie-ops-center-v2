"use client";

import { Sheet, SheetContent } from "@genie/ui";
import type { ReactNode } from "react";

import { useModuleClient } from "../../lib/rpc/module-client.tsx";
import { agentContract } from "../../services/agent/contract.ts";
import type { AgentArtifact, ChatLabels } from "../../services/agent/index.ts";
import type { Read } from "./answer-sources.ts";
import { ArtifactPanel } from "./artifact-panel.tsx";
import type { ArtifactRef } from "./artifact-refs.ts";
import { ChartCheckProvider } from "./chart-check.tsx";
import { ReadRowsPanel } from "./read-rows-panel.tsx";

export type ArtifactSlotProps = {
  readonly artifacts: readonly AgentArtifact[];
  readonly shown: ArtifactRef | null;
  readonly rows: Read | null;
  readonly labels: ChatLabels;
  readonly timeZone: string;
  readonly onShow: (ref: ArtifactRef) => void;
  readonly onClose: () => void;
};

/**
 * The artifact's place beside a chat (R-45a, czjw.108): a read's rows when `rows` is set, else the
 * shown artifact drawn through the chart gate, else nothing. Ask and the agent panel share it.
 */
export function ArtifactSlot(
  props: ArtifactSlotProps & { readonly variant: "column" | "sheet" }
): ReactNode {
  const agent = useModuleClient(agentContract);

  return props.rows !== null ? (
    <ReadRowsPanel
      read={props.rows}
      labels={props.labels}
      variant={props.variant}
      timeZone={props.timeZone}
      onClose={props.onClose}
    />
  ) : props.shown === null ? null : (
    <ChartCheckProvider
      check={(config) => agent.chart({ config })}
      timeZone={props.timeZone}
      datasetTitles={props.labels.datasets}
    >
      <ArtifactPanel
        artifacts={props.artifacts}
        shown={props.shown}
        onShow={props.onShow}
        onClose={props.onClose}
        variant={props.variant}
      />
    </ChartCheckProvider>
  );
}

/** The slot as a right sheet, open while an artifact or a read's rows is shown. */
export function ArtifactSheet(
  props: ArtifactSlotProps & {
    /** Where focus goes on close; by default the element that had it when the sheet opened. */
    readonly finalFocus?: HTMLElement | null | undefined;
  }
): ReactNode {
  return (
    <Sheet
      open={props.shown !== null || props.rows !== null}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-label={props.rows === null ? "Artifact" : "Rows"}
        finalFocus={() => props.finalFocus ?? true}
        // oxlint-disable-next-line shadcn/no-restyle -- the panel brings its own header and padding
        className="gap-0 overflow-hidden p-0"
      >
        <ArtifactSlot {...props} variant="sheet" />
      </SheetContent>
    </Sheet>
  );
}
