import { AppError } from "@genie/core";
import { z } from "zod";

import type { UndoEntry } from "../../config.ts";
import {
  DASHBOARD_PANEL_LIMIT,
  type DashboardChange,
  type DashboardFilters,
  type PanelLayout,
  UNDO_DEPTH,
} from "../../contract.ts";
import { ANALYTICS_ERRORS } from "../../errors.ts";

export type DraftPanel = {
  readonly id: string;
  readonly layout: PanelLayout;
  readonly config: unknown;
};

export type AppliedChanges = {
  readonly name: string;
  readonly filters: DashboardFilters;
  readonly panels: readonly DraftPanel[];
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

/** `p` + the highest number plus one, so an id stays unique on this dashboard (D9). */
export function nextPanelId(
  panels: readonly { readonly id: string }[]
): string {
  const highest = Math.max(0, ...panels.map(({ id }) => Number(id.slice(1))));

  return `p${highest + 1}`;
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
  let { filters } = current.config;
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
      panels[index] = {
        id: found.id,
        layout: change.layout ?? found.layout,
        config: change.panel === undefined ? found.config : change.panel,
      };

      if (change.panel !== undefined) checks.set(found.id, step);
    }
  }

  return { name, filters, panels, checks };
}
