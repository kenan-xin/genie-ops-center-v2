"use client";

import { RolesScreen, type RolesViewer } from "@genie/core/features/roles";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation.js";
import { useState } from "react";

import { useAdminWrite } from "../../../rpc/admin-write.ts";
import { rpc } from "../../../rpc/client.ts";

/**
 * The browser half of the Roles route. The server refused a caller without `core:roles:manage`
 * before this mounts, and every procedure re-checks it. The screen owns the selected role and the
 * form; each write reloads the list and the open detail through TanStack Query.
 */
export function RolesRoute(props: { readonly viewer: RolesViewer }) {
  const t = useTranslations("pages");
  const router = useRouter();
  // An audit target link opens the screen with its role selected.
  const linkedRoleId = useSearchParams().get("selected");
  const [selectedRoleId, setSelectedRoleId] = useState(linkedRoleId);

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

  const action = useAdminWrite({
    write: (work: () => Promise<void>) => work(),
    invalidate: [["roles"], ["role", selectedRoleId]],
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
      searchLabel={t("roles.searchLabel")}
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
