"use client";

import { RolesScreen, type RolesViewer } from "@genie/core/features/roles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation.js";
import { useState } from "react";

import { rpc } from "../../../rpc/client.ts";

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
    queryFn: () => rpc.roles.list(),
  });

  const detail = useQuery({
    queryKey: ["role", selectedRoleId],
    queryFn: () => rpc.roles.get({ roleId: selectedRoleId ?? "" }),
    enabled: selectedRoleId !== null,
  });

  // The declared permission catalogue the role form picks from (R-33).
  const catalogue = useQuery({
    queryKey: ["roles", "catalogue"],
    queryFn: () => rpc.roles.catalogue(),
  });

  const action = useMutation({
    mutationFn: (work: () => Promise<void>) => work(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await queryClient.invalidateQueries({
        queryKey: ["role", selectedRoleId],
      });
    },
  });

  // A write's answer is not read: the screen reloads instead.
  const run = <TResult,>(work: () => Promise<TResult>) => {
    action.mutate(async () => {
      await work();
    });
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
      pending={action.isPending}
      error={list.isError ? "The roles could not be read." : undefined}
      onCreateRole={(input) =>
        run(() =>
          rpc.roles.create({
            name: input.name,
            description: input.description,
            permissions: [...input.permissions],
          })
        )
      }
      onUpdateRole={(roleId, input) =>
        run(() =>
          rpc.roles.update({
            roleId,
            name: input.name,
            description: input.description,
            permissions: [...input.permissions],
          })
        )
      }
      onDeleteRole={(roleId) => run(() => rpc.roles.remove({ roleId }))}
      onOpenInAccess={(roleId) => {
        router.push(`/admin/access?recipient=${encodeURIComponent(roleId)}`);
      }}
    />
  );
}
