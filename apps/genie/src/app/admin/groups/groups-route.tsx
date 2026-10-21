"use client";

import { GroupsScreen, type GroupsViewer } from "@genie/core/features/groups";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { rpc } from "../../../rpc/client.ts";

/**
 * The browser half of the Groups route. The server has already refused a caller without
 * `core:groups:manage` before this mounts, and every procedure re-checks it, so the screen holds
 * no denied state. It owns the selected group, the archived toggle and the writes, and reloads the
 * list through TanStack Query after each one.
 */
export function GroupsRoute(props: { readonly viewer: GroupsViewer }) {
  const queryClient = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["groups", includeArchived],
    queryFn: () => rpc.groups.list({ includeArchived }),
  });

  const detail = useQuery({
    queryKey: ["group", selectedId],
    queryFn: () => rpc.groups.get({ groupId: selectedId ?? "" }),
    enabled: selectedId !== null,
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

  // One mutation runs any write and reloads the list and the open detail; the server is the
  // authority for every change, so the client never edits its cache by hand.
  const action = useMutation({
    mutationFn: (work: () => Promise<void>) => work(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["group", selectedId] });
    },
  });

  // A write's answer is not read: the screen reloads instead.
  const run = <TResult,>(work: () => Promise<TResult>) => {
    action.mutate(async () => {
      await work();
    });
  };

  const selected = selectedId ?? "";

  return (
    <GroupsScreen
      groups={list.data ?? []}
      viewer={props.viewer}
      includeArchived={includeArchived}
      onChangeIncludeArchived={setIncludeArchived}
      people={people.data ?? []}
      roles={assignableRoles.data ?? []}
      lastAdministratorGroupIds={
        detail.data?.lastAdministrator === true ? [selected] : []
      }
      onSelectGroup={setSelectedId}
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
      error={list.isError ? "The groups could not be read." : undefined}
      onAddDirectoryGroup={(externalId, displayLabel) =>
        run(() =>
          rpc.groups.addDirectoryGroup({
            externalId,
            displayLabel: displayLabel ?? null,
          })
        )
      }
      onArchiveGroup={(groupId) =>
        run(() => rpc.groups.archiveDirectoryGroup({ groupId }))
      }
      onDeleteGroup={(groupId) =>
        run(() => rpc.groups.deleteDirectoryGroup({ groupId }))
      }
      onEditLabel={(groupId, displayLabel) =>
        run(() => rpc.groups.editLabel({ groupId, displayLabel }))
      }
      onCreateLocalGroup={(name, description) =>
        run(() => rpc.groups.createLocalGroup({ name, description }))
      }
      onUpdateLocalGroup={(groupId, name, description) =>
        run(() => rpc.groups.updateLocalGroup({ groupId, name, description }))
      }
      onDeleteLocalGroup={(groupId) =>
        run(() => rpc.groups.deleteLocalGroup({ groupId }))
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
