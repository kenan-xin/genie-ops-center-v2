"use client";

import {
  PeopleScreen,
  type PeopleSettings,
  type PeopleViewer,
} from "@genie/core/features/people";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { trpc } from "../../../trpc/client.ts";

/** What a write returns: an id for a create, nothing for the rest. */
type WriteResult = void | { readonly id: string };

/**
 * The browser half of the People route. The server has already refused a caller without
 * `core:people:manage` before this mounts, and every procedure re-checks it, so the screen holds
 * no denied state. It owns the selection and the writes, and reloads the list and the open detail
 * through TanStack Query after each one.
 */
export function PeopleRoute(props: {
  readonly viewer: PeopleViewer;
  readonly settings: PeopleSettings;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["people"],
    queryFn: () => trpc.people.list.query(),
  });

  const detail = useQuery({
    queryKey: ["person", selectedId],
    queryFn: () => trpc.people.get.query({ personId: selectedId ?? "" }),
    enabled: selectedId !== null,
  });

  const roles = useQuery({
    queryKey: ["people", "assignable-roles"],
    queryFn: () => trpc.people.assignableRoles.query(),
  });

  // One mutation runs any write and reloads the list and the open detail; the server is the
  // authority for every change, so the client never edits its cache by hand.
  const action = useMutation({
    mutationFn: (work: () => Promise<WriteResult>) => work(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      await queryClient.invalidateQueries({ queryKey: ["person", selectedId] });
    },
  });

  const run = (work: () => Promise<WriteResult>) => {
    action.mutate(work);
  };

  return (
    <PeopleScreen
      people={list.data ?? []}
      viewer={props.viewer}
      settings={props.settings}
      roles={roles.data ?? []}
      loading={list.isPending}
      error={list.isError ? "The people could not be read." : undefined}
      lastAdministratorPersonIds={
        detail.data?.lastAdministrator === true && selectedId !== null
          ? [selectedId]
          : []
      }
      details={
        detail.data === undefined ? {} : { [detail.data.id]: detail.data }
      }
      onSelectPerson={setSelectedId}
      onAddPerson={(input) =>
        run(() =>
          trpc.people.add.mutate({ ...input, roleIds: [...input.roleIds] })
        )
      }
      onDisablePerson={(personId) =>
        run(() => trpc.people.disable.mutate({ personId }))
      }
      onEnablePerson={(personId) =>
        run(() => trpc.people.enable.mutate({ personId }))
      }
      onRemovePerson={(personId) =>
        run(() => trpc.people.remove.mutate({ personId }))
      }
      onResendSetPassword={(personId) =>
        run(() => trpc.people.resendSetPassword.mutate({ personId }))
      }
      onResendInvitation={(personId) =>
        run(() => trpc.people.resendInvitation.mutate({ personId }))
      }
    />
  );
}
