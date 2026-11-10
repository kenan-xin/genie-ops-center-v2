import { AppError } from "@genie/core";
import { z } from "zod";

import type { UndoEntry } from "../../config.ts";
import {
  DASHBOARD_PANEL_LIMIT,
  DASHBOARD_VIEW_LIMIT,
  type DashboardChange,
  type DashboardFilters,
  type DateRangeFilter,
  type PanelLayout,
  type SavedView,
  UNDO_DEPTH,
} from "../../contract.ts";
import { ANALYTICS_ERRORS } from "../../errors.ts";

export type DraftPanel = {
  readonly id: string;
  readonly layout: PanelLayout;
  readonly config: unknown;
  readonly ownRange?: DateRangeFilter | undefined;
};

export type AppliedChanges = {
  readonly name: string;
  readonly filters: DashboardFilters;
  readonly panels: readonly DraftPanel[];
  readonly views: readonly SavedView[];
  readonly defaultViewId: string | null;
  /** Each added or changed panel id, with the index of the last step that set its config. */
  readonly checks: ReadonlyMap<string, number>;
};

/** Only the type decides a new panel's default size; the chart gate parses the rest (D2). */
const kpiPanel = z.looseObject({ type: z.literal("kpi") });

function refuse(path: string, message: string): never {
  throw new AppError(ANALYTICS_ERRORS["change-invalid"], {
    issues: [{ path, message }],
  });
}

/** The prefix + the highest number plus one, so an id stays unique on this dashboard (D9). */
function nextId(
  prefix: string,
  items: readonly { readonly id: string }[]
): string {
  const highest = Math.max(0, ...items.map(({ id }) => Number(id.slice(1))));

  return `${prefix}${highest + 1}`;
}

export const nextPanelId = (panels: readonly { readonly id: string }[]) =>
  nextId("p", panels);

/** As panel ids, so a recorded agent request keeps its ids (P15-18). */
export const nextViewId = (views: readonly SavedView[]) => nextId("v", views);

/** The place of view `id`, or the step's refusal. */
function viewIndex(
  views: readonly SavedView[],
  id: string,
  step: number
): number {
  const at = views.findIndex((view) => view.id === id);

  if (at === -1)
    refuse(`changes.${step}.id`, `No view ${id} on this dashboard.`);

  return at;
}

/**
 * A step's view name, unless another view has it ignoring case and outer spaces (P15-17): the
 * strict save would refuse it only as a raw schema error.
 */
function assertNameFree(
  views: readonly SavedView[],
  name: string,
  step: number,
  ownId?: string
): void {
  const key = name.trim().toLowerCase();

  if (
    views.some(
      (view) => view.id !== ownId && view.name.trim().toLowerCase() === key
    )
  ) {
    refuse(
      `changes.${step}.name`,
      `Another view on this dashboard has the name ${name.trim()}.`
    );
  }
}

/** The saves Undo can restore, newest first, at most `UNDO_DEPTH` (D1). */
export function pushUndo(
  stack: readonly UndoEntry[],
  entry: UndoEntry
): readonly UndoEntry[] {
  return [entry, ...stack].slice(0, UNDO_DEPTH);
}

/**
 * The dashboard after every step, in order. The first refused step throws, so no step applies
 * on its own. Pure: the input is copied, never changed, and no panel config is checked here.
 */
export function applyChanges(
  current: UndoEntry,
  changes: readonly DashboardChange[]
): AppliedChanges {
  let { name } = current;
  let { filters, defaultViewId } = current.config;
  const views: SavedView[] = [...current.config.views];
  const panels: DraftPanel[] = [...current.config.panels];
  const checks = new Map<string, number>();

  for (const [step, change] of changes.entries()) {
    if (change.op === "rename") {
      ({ name } = change);
      continue;
    }

    if (change.op === "set-filters") {
      ({ filters } = change);
      continue;
    }

    if (change.op === "save-view") {
      const { id, ...saved } = change;

      if (id === undefined) {
        if (views.length >= DASHBOARD_VIEW_LIMIT) {
          throw new AppError(ANALYTICS_ERRORS["view-limit"]);
        }

        assertNameFree(views, saved.name, step);
        views.push({
          id: nextViewId(views),
          name: saved.name,
          filters: saved.filters,
        });
      } else {
        const at = viewIndex(views, id, step);

        assertNameFree(views, saved.name, step, id);
        views[at] = { id, name: saved.name, filters: saved.filters };
      }

      continue;
    }

    if (change.op === "remove-view") {
      views.splice(viewIndex(views, change.id, step), 1);

      // The dashboard then opens with its stored filters (ticket scope).
      if (defaultViewId === change.id) defaultViewId = null;

      continue;
    }

    if (change.op === "set-default-view") {
      if (change.id !== null) viewIndex(views, change.id, step);

      defaultViewId = change.id;
      continue;
    }

    if (change.op === "add-panel") {
      if (panels.length >= DASHBOARD_PANEL_LIMIT) {
        throw new AppError(ANALYTICS_ERRORS["panel-limit"]);
      }

      const id = nextPanelId(panels);

      panels.push({
        id,
        layout:
          change.layout ??
          (kpiPanel.safeParse(change.panel).success
            ? { columns: 1, rows: 1 }
            : { columns: 2, rows: 2 }),
        config: change.panel,
      });
      checks.set(id, step);
      continue;
    }

    const index = panels.findIndex(({ id }) => id === change.panelId);
    const found = panels[index];

    if (found === undefined) {
      refuse(
        `changes.${step}.panelId`,
        `No panel ${change.panelId} on this dashboard.`
      );
    }

    if (change.op === "remove-panel") {
      panels.splice(index, 1);
      checks.delete(change.panelId);
    } else if (change.op === "move-panel") {
      if (change.toIndex > panels.length - 1) {
        refuse(
          `changes.${step}.toIndex`,
          `This dashboard has no place ${change.toIndex}; its last place is ${panels.length - 1}.`
        );
      }

      panels.splice(index, 1);
      panels.splice(change.toIndex, 0, found);
    } else {
      // `null` clears the panel's own range; a step without it keeps the stored one (P15-10).
      const ownRange =
        change.ownRange === null
          ? undefined
          : (change.ownRange ?? found.ownRange);

      const changed = {
        id: found.id,
        layout: change.layout ?? found.layout,
        config: change.panel === undefined ? found.config : change.panel,
      };

      panels[index] =
        ownRange === undefined ? changed : { ...changed, ownRange };

      if (change.panel !== undefined) checks.set(found.id, step);
    }
  }

  return { name, filters, panels, views, defaultViewId, checks };
}
