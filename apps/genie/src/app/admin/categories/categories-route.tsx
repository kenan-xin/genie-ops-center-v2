"use client";

import { CategoriesScreen } from "@genie/core/features/categories";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { savedIfChanged, useAdminWrite } from "../../../rpc/admin-write.ts";
import { rpc } from "../../../rpc/client.ts";

type Assignment = {
  readonly moduleId: string;
  readonly categoryId: string | null;
};

/**
 * The browser half of the Categories route. The server refused a caller without
 * `core:settings:manage` before this mounts, and every procedure re-checks it. Each write reloads
 * both lists and the server-rendered navigation, whose headings come from categories.
 */
export function CategoriesRoute() {
  const t = useTranslations("pages.categories");

  const [failed, setFailed] = useState<
    { readonly assignment: Assignment; readonly message: string } | undefined
  >(undefined);

  const list = useQuery({
    queryKey: ["categories"],
    queryFn: () => rpc.categories.list(),
  });

  const modules = useQuery({
    queryKey: ["modules"],
    queryFn: () => rpc.modules.list(),
  });

  // Create, rename, reorder and delete: a refusal shows the server's safe message, never a save.
  const change = useAdminWrite({
    write: (work: () => Promise<void>) => work(),
    invalidate: [["modules"], ["categories"]],
    refresh: true,
  });

  // A write's answer is not read: the screen reloads instead.
  const run = <TResult,>(work: () => Promise<TResult>) => {
    change.mutate(async () => {
      await work();
    });
  };

  const assign = useAdminWrite({
    write: (input: Assignment) => rpc.modules.setCategory(input),
    invalidate: [["modules"], ["categories"]],
    refresh: true,
    // The same category again wrote no audit row (R-90), so it claims no save.
    saved: savedIfChanged,
    // The refusal stays on the module's row with a retry.
    refused: ({ message }, assignment) => setFailed({ assignment, message }),
  });

  const place = (assignment: Assignment) => {
    setFailed(undefined);
    assign.mutate(assignment);
  };

  return (
    <CategoriesScreen
      list={list.data ?? { categories: [], ungroupedCount: 0 }}
      copy={{
        notice: t("notice"),
        helpLabel: t("help.label"),
        help: [t("help.what"), t("help.counts"), t("help.order")],
        noCategories: t("noCategories"),
        withoutCategory: (count) => t("withoutCategory", { count }),
        showWithoutCategory: (count) => t("showWithoutCategory", { count }),
        uncategorizedOnly: t("uncategorizedOnly"),
      }}
      // A data-shape filter: only a module with a workspace entry can be placed (Decision 6).
      modules={(modules.data ?? []).filter((module) => module.placeable)}
      onCreate={(name) => run(() => rpc.categories.create({ name }))}
      onRename={(categoryId, name) =>
        run(() => rpc.categories.rename({ categoryId, name }))
      }
      onReorder={(orderedIds) =>
        run(() => rpc.categories.reorder({ orderedIds: [...orderedIds] }))
      }
      onDelete={(categoryId) =>
        run(() => rpc.categories.remove({ categoryId }))
      }
      onAssign={(moduleId, categoryId) => place({ moduleId, categoryId })}
      failed={
        failed && {
          moduleId: failed.assignment.moduleId,
          message: failed.message,
        }
      }
      onRetry={failed && (() => place(failed.assignment))}
      reordering={change.isPending}
      loading={list.isPending || modules.isPending}
      // A failed background refetch keeps the rows already read; only a first read failure shows.
      error={
        (list.isError && list.data === undefined) ||
        (modules.isError && modules.data === undefined)
          ? "The categories could not be read."
          : undefined
      }
    />
  );
}
