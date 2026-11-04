"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@genie/ui";
import { chartRows, type ChartTextRows } from "@genie/ui/chart-data";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  XIcon,
} from "lucide-react";
import { unparse } from "papaparse";
import { useState, type ReactNode } from "react";

import type { AgentArtifact } from "../../services/agent/index.ts";
import { ARTIFACT_VIEWS } from "./artifact-kinds.tsx";
import type { ArtifactRef } from "./artifact-refs.ts";
import { useGatedChart } from "./gated-chart.tsx";

/**
 * A cell that a spreadsheet would run as a formula gets a leading `'` (CSV injection). A plain
 * number such as "-6,500.00" stays as it is, which papaparse's default pattern would also mark.
 */
const FORMULA = /^[=+\-@\t\r](?![\d.,]*$)/;

function delimited(rows: ChartTextRows, delimiter: "," | "\t"): string {
  return unparse(
    { fields: [...rows.header], data: rows.rows.map((row) => [...row]) },
    { delimiter, escapeFormulae: FORMULA }
  );
}

function download(title: string, rows: ChartTextRows): void {
  const url = URL.createObjectURL(
    new Blob([delimited(rows, ",")], { type: "text/csv;charset=utf-8" })
  );

  const link = document.createElement("a");

  link.href = url;
  link.download = `${title}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The artifact panel (R-45a, `DEC-56`): one version of one artifact of the chat, drawn by its kind's
 * view, with steps between versions, every artifact of the chat in a menu, and the rows the view
 * shows to copy or download (AG21). The frame places it: a column beside Ask's chat, or a sheet.
 */
export function ArtifactPanel(props: {
  readonly artifacts: readonly AgentArtifact[];
  readonly shown: ArtifactRef;
  readonly onShow: (ref: ArtifactRef) => void;
  readonly onClose: () => void;
  readonly variant: "column" | "sheet";
}): ReactNode {
  const index = props.artifacts.findIndex(
    (artifact) => artifact.id === props.shown.artifactId
  );

  const artifact = props.artifacts[index];

  const versionIndex =
    artifact?.versions.findIndex(
      (version) => version.version === props.shown.version
    ) ?? -1;

  const version = artifact?.versions[versionIndex];

  const view =
    artifact === undefined ? undefined : ARTIFACT_VIEWS[artifact.kind];

  // The view draws through the same gate key, so this read costs no second gate call.
  const gated = useGatedChart(
    view === undefined ? undefined : version?.definition
  );

  const rows = gated.query.isSuccess ? chartRows(gated.query.data.data) : null;

  const [copied, setCopied] = useState(false);

  const step = (by: -1 | 1) => {
    const next = artifact?.versions[versionIndex + by];

    if (artifact !== undefined && next !== undefined) {
      props.onShow({ artifactId: artifact.id, version: next.version });
    }
  };

  const closeLabel =
    props.variant === "column" ? "Close the artifact" : "Back to the chat";

  const CloseIcon = props.variant === "column" ? XIcon : ArrowLeftIcon;

  const Icon = view?.icon;

  return (
    <section
      aria-label="Artifact"
      className="flex h-full min-h-0 flex-col bg-card text-card-foreground"
    >
      <header className="flex items-start gap-2 border-b border-border p-3">
        {Icon === undefined ? null : (
          <span
            aria-hidden="true"
            className="mt-1 grid size-8 shrink-0 place-items-center rounded-md bg-muted"
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </span>
        )}
        <div className="grid min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            {artifact?.title ?? "Artifact"}
          </h2>
          {artifact === undefined ? null : (
            <p className="text-xs text-muted-foreground">
              {view?.label ?? "Artifact"} · {index + 1} of{" "}
              {props.artifacts.length} in this chat
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="All artifacts in this chat"
              />
            }
          >
            <ChevronDownIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {props.artifacts.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() =>
                  props.onShow({
                    artifactId: item.id,
                    version: item.latestVersion,
                  })
                }
              >
                {item.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          aria-label={closeLabel}
          onClick={props.onClose}
        >
          <CloseIcon aria-hidden="true" />
        </Button>
      </header>

      {artifact === undefined || version === undefined ? (
        <p className="p-4 text-sm text-muted-foreground">
          This artifact cannot be shown here yet.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous version"
              disabled={versionIndex === 0}
              onClick={() => step(-1)}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <span className="text-sm tabular-nums">
              Version {version.version} of {artifact.latestVersion}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next version"
              disabled={versionIndex === artifact.versions.length - 1}
              onClick={() => step(1)}
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
            <span className="ms-auto flex items-center gap-1">
              <span role="status" className="text-xs text-muted-foreground">
                {copied ? "Rows copied" : ""}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copy the rows"
                disabled={rows === null}
                onClick={() => {
                  if (rows === null) return;

                  void navigator.clipboard
                    .writeText(delimited(rows, "\t"))
                    .then(() => setCopied(true));
                }}
              >
                <CopyIcon aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Download the rows"
                disabled={rows === null}
                onClick={() => {
                  if (rows !== null) download(artifact.title, rows);
                }}
              >
                <DownloadIcon aria-hidden="true" />
              </Button>
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {view === undefined ? (
              <p className="text-sm text-muted-foreground">
                This artifact cannot be shown here yet.
              </p>
            ) : (
              view.render(version.definition)
            )}
          </div>

          <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            {version.request === null
              ? `Version ${version.version}`
              : `Version ${version.version}, made for "${version.request}"`}
          </footer>
        </>
      )}
    </section>
  );
}
