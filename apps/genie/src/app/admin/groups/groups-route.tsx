"use client";

import { GroupsScreen, type GroupsViewer } from "@genie/core/features/groups";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { trpc } from "../../../trpc/client.ts";

/** What a write returns: an id for a create, nothing for the rest. */
type WriteResult = void | { readonly id: string };

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
    queryFn: () => trpc.groups.list.query({ includeArchived }),
  });

  const detail = useQuery({
    queryKey: ["group", selectedId],
    queryFn: () => trpc.groups.get.query({ groupId: selectedId ?? "" }),
    enabled: selectedId !== null,
  });

  // The local-group member picker reads the narrow active-people read the People router owns,
  // still behind core:groups:manage (S2-10 moved it from the groups router).
  const people = useQuery({
    queryKey: ["people", "active"],
    queryFn: () => trpc.people.active.query(),
  });

  const assignableRoles = useQuery({
    queryKey: ["groups", "assignable-roles"],
    queryFn: () => trpc.groups.assignableRoles.query(),
  });

  // One mutation runs any write and reloads the list and the open detail; the server is the
  // authority for every change, so the client never edits its cache by hand.
  const action = useMutation({
    mutationFn: (work: () => Promise<WriteResult>) => work(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["group", selectedId] });
    },
  });

  const run = (work: () => Promise<WriteResult>) => {
    action.mutate(work);
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
          trpc.groups.addDirectoryGroup.mutate({
            externalId,
            displayLabel: displayLabel ?? null,
          })
        )
      }
      onArchiveGroup={(groupId) =>
        run(() => trpc.groups.archiveDirectoryGroup.mutate({ groupId }))
      }
      onDeleteGroup={(groupId) =>
        run(() => trpc.groups.deleteDirectoryGroup.mutate({ groupId }))
      }
      onEditLabel={(groupId, displayLabel) =>
        run(() => trpc.groups.editLabel.mutate({ groupId, displayLabel }))
      }
      onCreateLocalGroup={(name, description) =>
        run(() => trpc.groups.createLocalGroup.mutate({ name, description }))
      }
      onUpdateLocalGroup={(groupId, name, description) =>
        run(() =>
          trpc.groups.updateLocalGroup.mutate({ groupId, name, description })
        )
      }
      onDeleteLocalGroup={(groupId) =>
        run(() => trpc.groups.deleteLocalGroup.mutate({ groupId }))
      }
      onAddMembers={(groupId, userIds) =>
        run(() =>
          trpc.groups.addMembers.mutate({ groupId, userIds: [...userIds] })
        )
      }
      onRemoveMembers={(groupId, userIds) =>
        run(() =>
          trpc.groups.removeMembers.mutate({ groupId, userIds: [...userIds] })
        )
      }
      onRemoveAllMembers={(groupId) =>
        run(() => trpc.groups.removeAllMembers.mutate({ groupId }))
      }
      onAssignRole={(groupId, roleId) =>
        run(() => trpc.groups.assignRole.mutate({ groupId, roleId }))
      }
      onUnassignRole={(groupId, assignmentId) =>
        run(() => trpc.groups.unassign.mutate({ groupId, assignmentId }))
      }
    />
  );
}
