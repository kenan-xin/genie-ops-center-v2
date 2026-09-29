"use client";

import { RolesScreen, type RolesViewer } from "@genie/core/features/roles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation.js";
import { useState } from "react";

import { trpc } from "../../../trpc/client.ts";

/** What a write returns: an id for a create, nothing for the rest. */
type WriteResult = void | { readonly id: string };

/**
 * The browser half of the Roles route. The server refused a caller without `core:roles:manage`
 * before this mounts, and every procedure re-checks it. The screen owns the selected role and the
 * form; each write reloads the list and the open detail through TanStack Query.
 */
export function RolesRoute(props: { readonly viewer: RolesViewer }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["roles"],
    queryFn: () => trpc.roles.list.query(),
  });

  const detail = useQuery({
    queryKey: ["role", selectedRoleId],
    queryFn: () => trpc.roles.get.query({ roleId: selectedRoleId ?? "" }),
    enabled: selectedRoleId !== null,
  });

  // The declared permission catalogue the role form picks from (R-33).
  const catalogue = useQuery({
    queryKey: ["roles", "catalogue"],
    queryFn: () => trpc.roles.catalogue.query(),
  });

  const action = useMutation({
    mutationFn: (work: () => Promise<WriteResult>) => work(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await queryClient.invalidateQueries({
        queryKey: ["role", selectedRoleId],
      });
    },
  });

  const run = (work: () => Promise<WriteResult>) => {
    action.mutate(work);
  };

  return (
    <RolesScreen
      roles={list.data ?? []}
      catalogue={catalogue.data ?? []}
      viewer={props.viewer}
      selectedRoleId={selectedRoleId}
      onSelectRole={setSelectedRoleId}
      detail={detail.data}
      loading={list.isPending}
      error={list.isError ? "The roles could not be read." : undefined}
      onCreateRole={(input) =>
        run(() =>
          trpc.roles.create.mutate({
            name: input.name,
            description: input.description,
            permissions: [...input.permissions],
          })
        )
      }
      onUpdateRole={(roleId, input) =>
        run(() =>
          trpc.roles.update.mutate({
            roleId,
            name: input.name,
            description: input.description,
            permissions: [...input.permissions],
          })
        )
      }
      onDeleteRole={(roleId) => run(() => trpc.roles.remove.mutate({ roleId }))}
      onOpenInAccess={(roleId) => {
        router.push(`/admin/access?recipient=${encodeURIComponent(roleId)}`);
      }}
    />
  );
}
