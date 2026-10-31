"use client";

import { PageHeader } from "@genie/core/features/shell";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  FieldLabel,
  Input,
} from "@genie/ui";
import { useId, useState } from "react";

import type { DashboardChange } from "../contract.ts";
import { FiltersBar } from "./filters-bar.tsx";
import { PanelCard } from "./panel-card.tsx";
import {
  type AppIssue,
  appCodeOf,
  appIssuesOf,
  useDashboard,
  useDashboardChange,
  useUndoDashboard,
} from "./use-dashboard.ts";
import type { DashboardPageView } from "./views.ts";

export type DashboardViewProps = {
  readonly view: DashboardPageView;
};

type ChangeFailure = {
  readonly kind: "change" | "undo";
  readonly panelTitle?: string | undefined;
  readonly error: unknown;
};

type RenameTarget =
  | { readonly kind: "dashboard"; readonly value: string }
  | {
      readonly kind: "panel";
      readonly panelId: string;
      readonly value: string;
    };

type Refusal = {
  readonly message: string;
  readonly issues: readonly AppIssue[];
  readonly reload: boolean;
};

/** The refusal line of an edit, its issue lines and whether Reload follows (R-49). */
function refusalOf(failure: ChangeFailure): Refusal {
  const message = failure.error instanceof Error ? failure.error.message : "";
  const issues = appIssuesOf(failure.error);
  const reload = appCodeOf(failure.error) === "analytics:dashboard-changed";

  if (failure.kind === "undo") {
    return {
      message: `The last change was not undone. ${message}`,
      issues,
      reload,
    };
  }

  if (reload) return { message, issues, reload };

  return {
    message:
      failure.panelTitle === undefined
        ? message
        : `${failure.panelTitle} was not changed. ${message}`,
    issues,
    reload,
  };
}

function ChangeRefusal(props: {
  readonly failure: ChangeFailure;
  readonly onReload: () => void;
}) {
  const { message, issues, reload } = refusalOf(props.failure);

  return (
    <div role="alert" className="grid gap-1 text-sm text-destructive">
      <p>{message}</p>
      {issues.map((issue, index) => (
        <p key={`${index}:${issue.path}`}>{issue.message}</p>
      ))}
      {reload ? (
        <Button type="button" variant="secondary" onClick={props.onReload}>
          Reload
        </Button>
      ) : null}
    </div>
  );
}

/** One dashboard: its filters, its live panel grid and its hand edits (R-48 to R-50). */
export function DashboardView(props: DashboardViewProps) {
  const { view } = props;
  const dashboardQuery = useDashboard(view.dashboard);
  const dashboard = dashboardQuery.data ?? view.dashboard;
  const change = useDashboardChange(dashboard);
  const undo = useUndoDashboard(dashboard);
  const nameId = useId();
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const [failure, setFailure] = useState<ChangeFailure | null>(null);

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

  return (
    <main>
      <PageHeader
        title={dashboard.name}
        actions={
          view.canWrite ? (
            <>
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
              {editing ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      openRename({ kind: "dashboard", value: dashboard.name })
                    }
                  >
                    Rename dashboard
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!dashboard.canUndo}
                    loading={undo.isPending}
                    onClick={undoLast}
                  >
                    Undo
                  </Button>
                </>
              ) : null}
            </>
          ) : undefined
        }
      />
      {renaming === null && refusal !== null ? (
        <div className="mb-4">{refusal}</div>
      ) : null}
      {view.canWrite ? (
        <div className="mb-4">
          <FiltersBar dashboard={dashboard} />
        </div>
      ) : null}
      {dashboard.panels.length === 0 ? (
        <EmptyState
          variant="framed"
          title="No panels yet"
          description={
            view.chat.kind === "on"
              ? "Ask in the chat beside the dashboard to add a panel."
              : "This dashboard has no panels."
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          {dashboard.panels.map((panel, index) => (
            <PanelCard
              key={panel.id}
              dashboard={dashboard}
              panel={panel}
              index={index}
              count={dashboard.panels.length}
              timeZone={view.timeZone}
              editing={editing}
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
