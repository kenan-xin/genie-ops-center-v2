"use client";

import { CategoriesScreen } from "@genie/core/features/categories";
import { toast } from "@genie/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation.js";
import { useState } from "react";

import { refusalOf, rpc } from "../../../rpc/client.ts";

const SAVED = "Saved. Written to the audit log.";

// A network failure or a non-catalogue answer carries no safe message of its own.
const NOT_SAVED = "That change could not be saved. Try again.";

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
  const queryClient = useQueryClient();
  const router = useRouter();

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

  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: ["modules"] });
    await queryClient.invalidateQueries({ queryKey: ["categories"] });
    // The navigation is rendered on the server; no client query holds it.
    router.refresh();
  };

  // Create, rename, reorder and delete: a refusal shows the server's safe message, never a save.
  const change = useMutation({
    mutationFn: (work: () => Promise<void>) => work(),
    onSuccess: () => toast({ tone: "success", title: SAVED }),
    onError: (cause) =>
      toast({ tone: "error", title: refusalOf(cause).message || NOT_SAVED }),
    onSettled: reload,
  });

  // A write's answer is not read: the screen reloads instead.
  const run = <TResult,>(work: () => Promise<TResult>) => {
    change.mutate(async () => {
      await work();
    });
  };

  const assign = useMutation({
    mutationFn: (input: Assignment) => rpc.modules.setCategory(input),
    onMutate: () => setFailed(undefined),
    // The same category again wrote no audit row (R-90), so it claims no save.
    onSuccess: (result) => {
      if (result.changed) toast({ tone: "success", title: SAVED });
    },
    onError: (cause, assignment) =>
      setFailed({ assignment, message: refusalOf(cause).message || NOT_SAVED }),
    onSettled: reload,
  });

  return (
    <CategoriesScreen
      list={list.data ?? { categories: [], ungroupedCount: 0 }}
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
      onAssign={(moduleId, categoryId) =>
        assign.mutate({ moduleId, categoryId })
      }
      failed={
        failed && {
          moduleId: failed.assignment.moduleId,
          message: failed.message,
        }
      }
      onRetry={failed && (() => assign.mutate(failed.assignment))}
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
