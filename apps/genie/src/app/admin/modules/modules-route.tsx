"use client";

import { accessOverviewHref, ModuleSheet } from "@genie/core/features/access";
import {
  type ModuleRefusal,
  ModulesScreen,
} from "@genie/core/features/modules";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation.js";
import { useState } from "react";

import { savedIfChanged, useAdminWrite } from "../../../rpc/admin-write.ts";
import { rpc } from "../../../rpc/client.ts";
import { useAddAssignment } from "../access/use-add-assignment.ts";
import { useRecordLabels } from "../access/use-record-labels.ts";

/** The module sheet lists the newest 25 (P12-16); Manage in Access shows the rest. */
const SHEET_ROWS = 25;

const searchRecipients = (query: string) =>
  rpc.roles.recipients({ query, limit: 10 });

/**
 * The browser half of the Modules route. The server refused a caller without
 * `core:settings:manage` before this mounts, and every procedure re-checks it. Each write reloads
 * both lists and the server-rendered navigation, because a switch changes what members see. The
 * holders link to Access only for a caller who holds `core:roles:manage` (R-37e). A tenant-wide
 * roles manager opens a module's sheet from its name, which reads the module's newest assignments
 * and adds one (P12-16).
 */
export function ModulesRoute(props: {
  readonly canManageAccess: boolean;
  /** Tenant-wide `core:roles:manage`, the server's own gate for adding and for every Access read (P12-2). */
  readonly canAddAssignments: boolean;
  readonly viewerId: string;
  readonly timeZone: string;
}) {
  const t = useTranslations("pages");
  const tNoMatch = useTranslations("noMatch");
  const router = useRouter();
  const [refusal, setRefusal] = useState<ModuleRefusal | undefined>(undefined);

  // Kept after close, so the sheet does not blank during its exit.
  const [sheet, setSheet] = useState({ id: "", open: false });

  const modules = useQuery({
    queryKey: ["modules"],
    queryFn: () => rpc.modules.list(),
  });

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => rpc.categories.list(),
  });

  const sheetModule = modules.data?.find((module) => module.id === sheet.id);

  const moduleAssignments = useQuery({
    queryKey: ["access", "module", sheet.id],
    queryFn: () =>
      rpc.roles.assignments({ moduleId: sheet.id, limit: SHEET_ROWS }),
    enabled: props.canAddAssignments && sheet.open,
  });

  const recordLabels = useRecordLabels(moduleAssignments.data?.paths);

  const addAssignment = useAddAssignment({
    enabled: props.canAddAssignments && sheet.id !== "",
    moduleId: sheet.id === "" ? undefined : sheet.id,
  });

  const switchModule = useAdminWrite({
    write: (input: { moduleId: string; enabled: boolean }) =>
      rpc.modules.setEnabled(input),
    invalidate: [["modules"], ["categories"]],
    // A switch changes what members see in the server-rendered navigation.
    refresh: true,
    // A switch that changed nothing wrote no audit row (Decision 3), so it claims no save.
    saved: savedIfChanged,
    // The refusal stays on the module's row with the configuration issues it names.
    refused: ({ message, issues = [] }, input) =>
      setRefusal({ moduleId: input.moduleId, message, issues }),
  });

  const placeModule = useAdminWrite({
    write: (input: { moduleId: string; categoryId: string | null }) =>
      rpc.modules.setCategory(input),
    invalidate: [["modules"], ["categories"]],
    refresh: true,
    // The same category again wrote no audit row (R-90), so it claims no save.
    saved: savedIfChanged,
  });

  const pending = switchModule.isPending
    ? switchModule.variables.moduleId
    : placeModule.isPending
      ? placeModule.variables.moduleId
      : undefined;

  return (
    <>
      <ModulesScreen
        modules={modules.data ?? []}
        categories={categories.data?.categories ?? []}
        pending={pending}
        refusal={refusal}
        onSwitch={(moduleId, enabled) => {
          setRefusal(undefined);
          switchModule.mutate({ moduleId, enabled });
        }}
        onCategory={(moduleId, categoryId) =>
          placeModule.mutate({ moduleId, categoryId })
        }
        manageAccessHref={
          props.canAddAssignments
            ? (moduleId) => accessOverviewHref({ module: moduleId })
            : undefined
        }
        onOpenModule={
          props.canAddAssignments
            ? (id) => setSheet({ id, open: true })
            : undefined
        }
        settingsHref="/admin/settings"
        accessLabels={{
          more: (count) => t("modules.access.more", { count }),
          group: (group) => t("modules.access.group", { group }),
          saving: (module) => t("modules.access.saving", { module }),
          whoCanOpen: t("modules.access.whoCanOpen"),
          whoCanOpenFor: (module) =>
            t("modules.access.whoCanOpenFor", { module }),
          nobody: t("modules.access.nobody"),
          manage: t("modules.access.manage"),
          category: t("modules.access.category"),
        }}
        searchLabel={t("modules.searchLabel")}
        noMatch={{
          title: t("modules.noMatch.title"),
          description: t("modules.noMatch.description"),
          clearLabel: tNoMatch("clear"),
        }}
        loading={modules.isPending || categories.isPending}
        // A failed background refetch keeps the rows already read; only a first read failure shows.
        error={
          (modules.isError && modules.data === undefined) ||
          (categories.isError && categories.data === undefined)
            ? "The modules could not be read."
            : undefined
        }
      />
      {sheetModule === undefined ? null : (
        <ModuleSheet
          open={sheet.open}
          module={sheetModule}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
          page={moduleAssignments.data}
          error={moduleAssignments.isError}
          recordLabels={recordLabels}
          timeZone={props.timeZone}
          host={addAssignment}
          search={searchRecipients}
          selfId={props.viewerId}
          onManageAccess={() =>
            router.push(accessOverviewHref({ module: sheet.id }))
          }
        />
      )}
    </>
  );
}
