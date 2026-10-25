"use client";

import {
  type ModuleRefusal,
  ModulesScreen,
} from "@genie/core/features/modules";
import { toast } from "@genie/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation.js";
import { useState } from "react";

import { refusalOf, rpc } from "../../../rpc/client.ts";

const SAVED = "Saved. Written to the audit log.";

// A network failure or a non-catalogue answer carries no safe message of its own.
const NOT_SAVED = "That change could not be saved. Try again.";

/**
 * The browser half of the Modules route. The server refused a caller without
 * `core:settings:manage` before this mounts, and every procedure re-checks it. Each write reloads
 * both lists and the server-rendered navigation, because a switch changes what members see.
 */
export function ModulesRoute() {
  const queryClient = useQueryClient();
  const router = useRouter();
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

  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: ["modules"] });
    await queryClient.invalidateQueries({ queryKey: ["categories"] });
    // The navigation is rendered on the server; no client query holds it.
    router.refresh();
  };

  const switchModule = useMutation({
    mutationFn: (input: { moduleId: string; enabled: boolean }) =>
      rpc.modules.setEnabled(input),
    onMutate: () => setRefusal(undefined),
    // A switch that changed nothing wrote no audit row (Decision 3), so it claims no save.
    onSuccess: (result) => {
      if (result.changed) toast({ tone: "success", title: SAVED });
    },
    onError: (cause, input) => {
      const { message, issues = [] } = refusalOf(cause);
      setRefusal({
        moduleId: input.moduleId,
        message: message || NOT_SAVED,
        issues,
      });
    },
    onSettled: reload,
  });

  const placeModule = useMutation({
    mutationFn: (input: { moduleId: string; categoryId: string | null }) =>
      rpc.modules.setCategory(input),
    // The same category again wrote no audit row (R-90), so it claims no save.
    onSuccess: (result) => {
      if (result.changed) toast({ tone: "success", title: SAVED });
    },
    onError: (cause) =>
      toast({ tone: "error", title: refusalOf(cause).message || NOT_SAVED }),
    onSettled: reload,
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
      onSwitch={(moduleId, enabled) =>
        switchModule.mutate({ moduleId, enabled })
      }
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
