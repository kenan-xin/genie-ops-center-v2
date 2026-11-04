"use client";

import { AgentPanel, ChatDock, ChatPanel } from "@genie/core/features/agent";
import { PageHeader } from "@genie/core/features/shell";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  FieldLabel,
  formatReadTime,
  InfoNote,
  Input,
} from "@genie/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import type { DashboardChange } from "../contract.ts";
import { type ChangeFailure, ChangeRefusal } from "./change-refusal.tsx";
import { FiltersBar } from "./filters-bar.tsx";
import { PanelCard } from "./panel-card.tsx";
import {
  dashboardQueryKey,
  useDashboard,
  useDashboardChange,
  useUndoDashboard,
} from "./use-dashboard.ts";
import type { DashboardPageView } from "./views.ts";

export type DashboardViewProps = {
  readonly view: DashboardPageView;
};

/** The empty dashboard's starters (6.5); the module names no dataset. */
const STARTERS = [
  "Add a figure for this month",
  "Add a chart by month",
  "Add a table of the latest records",
] as const;

/** The chat's own suggestions (6.4), apart from the starters so no chip shows twice. */
const CHAT_SUGGESTIONS = [
  "Compare with the prior quarter",
  "Make the charts one size",
] as const;

type RenameTarget =
  | { readonly kind: "dashboard"; readonly value: string }
  | {
      readonly kind: "panel";
      readonly panelId: string;
      readonly value: string;
    };

/** One dashboard: its filters, its live panel grid and its hand edits (R-48 to R-50). */
export function DashboardView(props: DashboardViewProps) {
  const { view } = props;
  const dashboardQuery = useDashboard(view.dashboard);
  const dashboard = dashboardQuery.data ?? view.dashboard;
  const change = useDashboardChange(dashboard);
  const undo = useUndoDashboard(dashboard);
  const queryClient = useQueryClient();
  const nameId = useId();
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const [failure, setFailure] = useState<ChangeFailure | null>(null);

  // The latest read of any panel, for the one "Figures as of" line (6.1).
  const [readAt, setReadAt] = useState<string | null>(null);

  // A starter chip of the empty dashboard, until the chat sent it.
  const [starter, setStarter] = useState<string | undefined>(undefined);

  function send(
    changes: readonly DashboardChange[],
    options: { readonly panelTitle?: string; readonly onSuccess?: () => void }
  ) {
    setFailure(null);
    change.mutate(changes, {
      onSuccess: () => options.onSuccess?.(),
      onError: (error) =>
        setFailure({ kind: "change", panelTitle: options.panelTitle, error }),
    });
  }

  function openRename(target: RenameTarget) {
    setFailure(null);
    setRenaming(target);
  }

  function closeRename() {
    setRenaming(null);
    setFailure(null);
  }

  function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (renaming === null) return;

    const value = renaming.value.trim();

    if (value === "") return;

    if (renaming.kind === "dashboard") {
      send([{ op: "rename", name: value }], {
        onSuccess: () => setRenaming(null),
      });

      return;
    }

    // Read the panel now, not when the dialog opened: a refetch may have changed its config.
    const panel = dashboard.panels.find(
      (candidate) => candidate.id === renaming.panelId
    );

    if (panel === undefined) {
      setFailure({
        kind: "change",
        error: new Error("That panel was removed before the change was saved."),
      });

      return;
    }

    send(
      [
        {
          op: "change-panel",
          panelId: panel.id,
          panel: { ...panel.config, title: value },
        },
      ],
      {
        panelTitle: panel.config.title,
        onSuccess: () => setRenaming(null),
      }
    );
  }

  function undoLast() {
    setFailure(null);
    undo.mutate(undefined, {
      onError: (error) => setFailure({ kind: "undo", error }),
    });
  }

  function reload() {
    setFailure(null);
    void dashboardQuery.refetch();
  }

  const refusal =
    failure === null ? null : (
      <ChangeRefusal failure={failure} onReload={reload} />
    );

  const chat = view.chat;
  const chatOn = chat.kind === "on";

  // Only a person who may write gets the chat's write tools.
  const starters = chatOn && view.canWrite;

  return (
    <main>
      <PageHeader
        title={dashboard.name}
        meta={
          readAt === null
            ? undefined
            : `Figures as of ${formatReadTime(readAt, view.timeZone)}.`
        }
        secondaryActions={
          view.canWrite ? (
            <>
              {/* Outside edit mode too: a chat answer tells the person to use Undo (R-49). */}
              {dashboard.canUndo ? (
                <Button
                  variant="secondary"
                  loading={undo.isPending}
                  onClick={undoLast}
                >
                  Undo
                </Button>
              ) : null}
              {/* A mode switch, so a pressed button, not a menu item. */}
              <Button
                variant="secondary"
                aria-pressed={editing}
                onClick={() => {
                  setEditing(!editing);
                  setFailure(null);
                }}
              >
                Edit dashboard
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="secondary" size="icon" aria-label="More" />
                  }
                >
                  <span aria-hidden="true">⋯</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      openRename({ kind: "dashboard", value: dashboard.name })
                    }
                  >
                    Rename dashboard
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : undefined
        }
      />
      <div className="grid gap-4">
        <div className="min-w-0">
          {renaming === null && refusal !== null ? (
            <div className="mb-4">{refusal}</div>
          ) : null}
          {view.canWrite ? (
            <div className="mb-4">
              <FiltersBar dashboard={dashboard} onReload={reload} />
            </div>
          ) : null}
          {dashboard.panels.length === 0 ? (
            <EmptyState
              variant="framed"
              title="No panels yet"
              description={
                starters
                  ? "Ask the chat for a chart, a figure or a table. You can move them after."
                  : "This dashboard has no panels."
              }
              action={
                starters ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    {STARTERS.map((text) => (
                      <Button
                        key={text}
                        variant="secondary"
                        size="sm"
                        onClick={() => setStarter(text)}
                      >
                        {text}
                      </Button>
                    ))}
                  </div>
                ) : undefined
              }
            />
          ) : (
            <div
              className={`grid gap-4 md:grid-cols-4 ${chatOn ? "xl:grid-cols-2" : ""}`}
            >
              {/* Beside the docked chat the grid has two columns, so a panel keeps useful width. */}
              {dashboard.panels.map((panel, index) => (
                <PanelCard
                  key={panel.id}
                  dashboard={dashboard}
                  panel={panel}
                  index={index}
                  count={dashboard.panels.length}
                  timeZone={view.timeZone}
                  editing={editing}
                  narrow={chatOn}
                  onRead={(at) =>
                    setReadAt((latest) =>
                      latest === null || at > latest ? at : latest
                    )
                  }
                  onChange={(target, changes) =>
                    send(changes, { panelTitle: target.config.title })
                  }
                  onRename={(target) =>
                    openRename({
                      kind: "panel",
                      panelId: target.id,
                      value: target.config.title,
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
        {chat.kind === "off" ? (
          <InfoNote size="md" role="status">
            Chat is off. You can still change this dashboard by hand.
          </InfoNote>
        ) : null}
      </div>
      {chat.kind === "on" ? (
        // The page's own chat, docked open from 1280 px; the shell hides its general chat.
        <ChatDock
          label="Chat"
          page
          dockedByDefault
          openRequested={starter !== undefined}
        >
          {(close) => (
            <ChatPanel
              title="Chat"
              about={`About ${dashboard.name}`}
              onClose={close}
            >
              {/* A new key per dashboard, so a move to another dashboard starts a new chat. */}
              <AgentPanel
                key={dashboard.id}
                context={{
                  recordType: "analytics-dashboard",
                  recordId: dashboard.id,
                }}
                models={chat.models}
                labels={chat.labels}
                suggestions={view.canWrite ? CHAT_SUGGESTIONS : []}
                timeZone={view.timeZone}
                newChatHref={`/m/analytics/dashboards/${dashboard.id}`}
                pending={
                  starter === undefined
                    ? undefined
                    : { text: starter, onSent: () => setStarter(undefined) }
                }
                // A chat change saves a new version; the page reads it at once.
                onFinished={() =>
                  void queryClient.invalidateQueries({
                    queryKey: dashboardQueryKey(dashboard.id),
                  })
                }
              />
            </ChatPanel>
          )}
        </ChatDock>
      ) : null}
      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) closeRename();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {renaming?.kind === "panel" ? "Rename panel" : "Rename dashboard"}
            </DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submitRename}>
            <Field>
              <FieldLabel htmlFor={nameId}>
                {renaming?.kind === "panel" ? "Title" : "Name"}
              </FieldLabel>
              <Input
                id={nameId}
                value={renaming?.value ?? ""}
                maxLength={renaming?.kind === "panel" ? undefined : 80}
                onValueChange={(value) =>
                  setRenaming((current) =>
                    current === null ? null : { ...current, value }
                  )
                }
              />
            </Field>
            {renaming === null ? null : refusal}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={closeRename}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={(renaming?.value.trim() ?? "") === ""}
                loading={change.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
