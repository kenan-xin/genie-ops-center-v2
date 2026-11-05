"use client";

import { useAgentPage } from "@genie/core/features/agent/panel";
import { PageHeader, PageLink } from "@genie/core/features/shell";
import { appCodeOf, useModuleClient } from "@genie/core/rpc/client";
import {
  Button,
  ConfirmDialog,
  DataTable,
  type DataTableAction,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  FieldError,
  FieldLabel,
  Input,
} from "@genie/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { analyticsContract, type DashboardSummary } from "../contract.ts";
import type { DashboardListView } from "./views.ts";

const LIST_QUERY = ["analytics", "dashboards"] as const;

const panelText = (count: number) =>
  `${count} ${count === 1 ? "panel" : "panels"}`;

const hrefOf = (id: string) => `/m/analytics/dashboards/${id}`;

export type DashboardListProps = {
  readonly view: DashboardListView;
  /**
   * Opens a dashboard after Create. Core gives a module no client router, so the default loads
   * the page as a document, like the settings screen's link to Modules.
   */
  readonly open?: (href: string) => void;
};

const openDocument = (href: string) => window.location.assign(href);

/** The Dashboards list: the owner's own dashboards, with create and delete (R-48). */
export function DashboardList(props: DashboardListProps) {
  const { view, open = openDocument } = props;
  const analytics = useModuleClient(analyticsContract);
  const queryClient = useQueryClient();
  const nameId = useId();
  const nameErrorId = useId();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  useAgentPage({ context: { page: "Dashboards" } });

  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(
    null
  );

  const dashboards = useQuery({
    queryKey: LIST_QUERY,
    queryFn: () => analytics.listDashboards(),
    initialData: [...view.dashboards],
  });

  const create = useMutation({
    mutationFn: (dashboardName: string) =>
      analytics.createDashboard({ name: dashboardName }),
    // The next step is to add panels by chat beside the new dashboard, so open it.
    onSuccess: (created) => {
      setCreating(false);
      setName("");
      void queryClient.invalidateQueries({ queryKey: LIST_QUERY });
      open(hrefOf(created.id));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => analytics.deleteDashboard({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_QUERY }),
  });

  // The save-failure rule: the name stays typed, and the refusal shows under its field.
  const failure = create.error;

  const fieldError =
    failure !== null && appCodeOf(failure) === "analytics:dashboard-name-taken"
      ? failure.message
      : null;

  const formError =
    failure !== null && fieldError === null ? failure.message : null;

  const columns: readonly DataTableColumn<DashboardSummary>[] = [
    {
      id: "name",
      header: "Name",
      cell: (row) => <PageLink href={hrefOf(row.id)}>{row.name}</PageLink>,
    },
    {
      id: "panels",
      header: "Panels",
      cell: (row) => panelText(row.panelCount),
      align: "end",
    },
  ];

  const actions = view.canWrite
    ? (row: DashboardSummary): readonly DataTableAction[] => [
        {
          label: "Delete",
          danger: true,
          onSelect: () => setConfirm({ id: row.id, name: row.name }),
        },
      ]
    : undefined;

  return (
    <main>
      <PageHeader
        title="Dashboards"
        description="Your own dashboards of live charts. Only you can open them."
        actions={
          view.canWrite ? (
            <Button
              onClick={() => {
                create.reset();
                setName("");
                setCreating(true);
              }}
            >
              New dashboard
            </Button>
          ) : undefined
        }
      />

      {remove.error === null ? null : (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {remove.error.message === ""
            ? "The dashboard was not deleted."
            : remove.error.message}
        </p>
      )}

      {dashboards.data.length === 0 ? (
        <EmptyState
          variant="framed"
          title="No dashboards yet"
          description="Create a dashboard, then add panels by chat beside it."
        />
      ) : (
        <DataTable
          label="Dashboards"
          rows={dashboards.data}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.name}
          columns={columns}
          card={{
            title: (row) => (
              <PageLink href={hrefOf(row.id)}>{row.name}</PageLink>
            ),
            facts: (row) => [panelText(row.panelCount)],
          }}
          {...(actions === undefined ? {} : { actions })}
        />
      )}

      <Dialog
        open={creating}
        onOpenChange={(next) => {
          setCreating(next);

          if (!next) create.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New dashboard</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();

              const trimmed = name.trim();

              if (trimmed !== "") create.mutate(trimmed);
            }}
          >
            <Field>
              <FieldLabel htmlFor={nameId}>Name</FieldLabel>
              <Input
                id={nameId}
                value={name}
                maxLength={80}
                aria-invalid={fieldError !== null}
                aria-describedby={fieldError === null ? undefined : nameErrorId}
                onValueChange={setName}
              />
              {fieldError === null ? null : (
                <FieldError id={nameErrorId}>{fieldError}</FieldError>
              )}
            </Field>
            {formError === null ? null : (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={name.trim() === ""}
                loading={create.isPending}
              >
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        title={`Delete ${confirm?.name ?? ""}?`}
        description="The dashboard and its panels are removed for good. Undo cannot bring them back."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (confirm !== null) remove.mutate(confirm.id);

          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </main>
  );
}
