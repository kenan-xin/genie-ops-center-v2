"use client";

import { GroupsScreen, type GroupsViewer } from "@genie/core/features/groups";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation.js";
import { useState } from "react";

import { useAdminWrite } from "../../../rpc/admin-write.ts";
import { rpc } from "../../../rpc/client.ts";

/**
 * The browser half of the Groups route. The server has already refused a caller without
 * `core:groups:manage` before this mounts, and every procedure re-checks it, so the screen holds
 * no denied state. It owns the selected group, the archived toggle and the writes, and reloads the
 * list through TanStack Query after each one.
 */
export function GroupsRoute(props: { readonly viewer: GroupsViewer }) {
  const t = useTranslations("pages");
  const [includeArchived, setIncludeArchived] = useState(false);
  // An audit target link opens the screen with its group selected.
  const initialSelectedId = useSearchParams().get("selected") ?? undefined;
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? null);
  // The detail is read only while the sheet is open; a close keeps `selectedId` for the exit.
  const [open, setOpen] = useState(initialSelectedId !== undefined);

  const list = useQuery({
    queryKey: ["groups", includeArchived],
    queryFn: () => rpc.groups.list({ includeArchived }),
  });

  const detail = useQuery({
    queryKey: ["group", selectedId],
    queryFn: () => rpc.groups.get({ groupId: selectedId ?? "" }),
    enabled: selectedId !== null && open,
  });

  // The local-group member picker reads the narrow active-people read the People router owns,
  // still behind core:groups:manage (S2-10 moved it from the groups router).
  const people = useQuery({
    queryKey: ["people", "active"],
    queryFn: () => rpc.people.active(),
  });

  const assignableRoles = useQuery({
    queryKey: ["groups", "assignable-roles"],
    queryFn: () => rpc.groups.assignableRoles(),
  });

  // One write runs any change and reloads the list and the open detail.
  const action = useAdminWrite({
    write: (work: () => Promise<void>) => work(),
    invalidate: [["groups"], ["group", selectedId]],
  });

  // The add dialogs await their write and show the refusal it rejects with (U-1), so it gets no
  // toast. A success keeps its toast.
  const addDirectory = useAdminWrite({
    write: (input: {
      readonly externalId: string;
      readonly displayLabel?: string | undefined;
    }) =>
      rpc.groups.addDirectoryGroup({
        externalId: input.externalId,
        displayLabel: input.displayLabel ?? null,
      }),
    invalidate: [["groups"]],
    refused: () => undefined,
    notSaved: () => t("groups.notAdded"),
  });

  const createLocal = useAdminWrite({
    write: (input: { readonly name: string; readonly description: string }) =>
      rpc.groups.createLocalGroup(input),
    invalidate: [["groups"]],
    refused: () => undefined,
    notSaved: () => t("groups.notCreated"),
  });

  // A write's answer is not read: the screen reloads instead.
  const run = <TResult,>(work: () => Promise<TResult>) => {
    action.mutate(async () => {
      await work();
    });
  };

  // A delete closes the detail before the write, so the reload never reads the removed group. A
  // refusal keeps the group, so it opens the detail again.
  const remove = <TResult,>(work: () => Promise<TResult>) => {
    setOpen(false);
    action.mutate(
      async () => {
        await work();
      },
      { onError: () => setOpen(true) }
    );
  };

  const selected = selectedId ?? "";

  return (
    <GroupsScreen
      groups={list.data ?? []}
      viewer={props.viewer}
      labelHint={t("groups.addLabelHint")}
      searchLabel={t("groups.searchLabel")}
      includeArchived={includeArchived}
      onChangeIncludeArchived={setIncludeArchived}
      people={people.data ?? []}
      roles={assignableRoles.data ?? []}
      lastAdministratorGroupIds={
        detail.data?.lastAdministrator === true ? [selected] : []
      }
      initialSelectedId={initialSelectedId}
      // A close keeps the last detail, so the sheet keeps its members and roles while it closes.
      onSelectGroup={(groupId) => {
        setOpen(groupId !== null);

        if (groupId !== null) setSelectedId(groupId);
      }}
      details={
        detail.data === undefined
          ? {}
          : {
              [detail.data.id]: {
                members: detail.data.members,
                assignments: detail.data.assignments,
              },
            }
      }
      loading={list.isPending}
      pending={
        action.isPending || addDirectory.isPending || createLocal.isPending
      }
      error={list.isError ? "The groups could not be read." : undefined}
      onAddDirectoryGroup={async (externalId, displayLabel) => {
        await addDirectory.mutateAsync({ externalId, displayLabel });
      }}
      onArchiveGroup={(groupId) =>
        run(() => rpc.groups.archiveDirectoryGroup({ groupId }))
      }
      onDeleteGroup={(groupId) =>
        remove(() => rpc.groups.deleteDirectoryGroup({ groupId }))
      }
      onEditLabel={(groupId, displayLabel) =>
        run(() => rpc.groups.editLabel({ groupId, displayLabel }))
      }
      onCreateLocalGroup={async (name, description) => {
        await createLocal.mutateAsync({ name, description });
      }}
      onUpdateLocalGroup={(groupId, name, description) =>
        run(() => rpc.groups.updateLocalGroup({ groupId, name, description }))
      }
      onDeleteLocalGroup={(groupId) =>
        remove(() => rpc.groups.deleteLocalGroup({ groupId }))
      }
      onAddMembers={(groupId, userIds) =>
        run(() => rpc.groups.addMembers({ groupId, userIds: [...userIds] }))
      }
      onRemoveMembers={(groupId, userIds) =>
        run(() => rpc.groups.removeMembers({ groupId, userIds: [...userIds] }))
      }
      onRemoveAllMembers={(groupId) =>
        run(() => rpc.groups.removeAllMembers({ groupId }))
      }
      onAssignRole={(groupId, roleId) =>
        run(() => rpc.groups.assignRole({ groupId, roleId }))
      }
      onUnassignRole={(groupId, assignmentId) =>
        run(() => rpc.groups.unassign({ groupId, assignmentId }))
      }
    />
  );
}
