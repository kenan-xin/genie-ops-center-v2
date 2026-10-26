"use client";

import {
  type ModuleRefusal,
  ModulesScreen,
} from "@genie/core/features/modules";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { savedIfChanged, useAdminWrite } from "../../../rpc/admin-write.ts";
import { rpc } from "../../../rpc/client.ts";

/**
 * The browser half of the Modules route. The server refused a caller without
 * `core:settings:manage` before this mounts, and every procedure re-checks it. Each write reloads
 * both lists and the server-rendered navigation, because a switch changes what members see.
 */
export function ModulesRoute() {
  const t = useTranslations("pages");
  const [refusal, setRefusal] = useState<ModuleRefusal | undefined>(undefined);

  const modules = useQuery({
    queryKey: ["modules"],
    queryFn: () => rpc.modules.list(),
  });

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => rpc.categories.list(),
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
      rolesHref="/admin/roles"
      settingsHref="/admin/settings"
      accessLabels={{
        more: (count) => t("modules.access.more", { count }),
        showAll: (count, module) =>
          t("modules.access.showAll", { count, module }),
        title: (module) => t("modules.access.title", { module }),
        group: (group) => t("modules.access.group", { group }),
        saving: (module) => t("modules.access.saving", { module }),
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
  );
}
