"use client";

import {
  RolesScreen,
  type RoleInput,
  type RolesViewer,
} from "@genie/core/features/roles";
import { PageHeader } from "@genie/core/features/shell";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation.js";

import { useAdminWrite } from "../../../rpc/admin-write.ts";
import { rpc } from "../../../rpc/client.ts";

/**
 * The browser half of the Roles route. The server refused a caller without `core:roles:manage`
 * before this mounts, and every procedure re-checks it. The selected role lives in the URL
 * (`?selected=`), so an audit target link, the back button and the header trail to Roles all open
 * the right view; each write reloads the list and the open detail through TanStack Query.
 */
export function RolesRoute(props: { readonly viewer: RolesViewer }) {
  const t = useTranslations("pages");
  const tNoMatch = useTranslations("noMatch");
  const router = useRouter();
  const pathname = usePathname();
  const selectedRoleId = useSearchParams().get("selected");

  // A shallow history entry: Next syncs `useSearchParams` with it and renders nothing on the server.
  const selectRole = (roleId: string | null) => {
    window.history.pushState(
      null,
      "",
      roleId === null
        ? pathname
        : `${pathname}?selected=${encodeURIComponent(roleId)}`
    );
  };

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

  // The role form awaits its save and shows the refusal it rejects with (U-1), so it gets no
  // toast. A success keeps its toast.
  const save = useAdminWrite({
    write: (work: () => Promise<void>) => work(),
    invalidate: [["roles"], ["role", selectedRoleId]],
    refused: () => undefined,
    notSaved: () => t("roles.notSaved"),
  });

  // A write's answer is not read: the screen reloads instead.
  const run = <TResult,>(work: () => Promise<TResult>) => {
    action.mutate(async () => {
      await work();
    });
  };

  const saveRole = (roleId: string | null, input: RoleInput) =>
    save.mutateAsync(async () => {
      const fields = {
        name: input.name,
        description: input.description,
        permissions: [...input.permissions],
      };

      await (roleId === null
        ? rpc.roles.create(fields)
        : rpc.roles.update({ roleId, ...fields }));
    });

  return (
    <>
      <PageHeader
        title={t("roles.title")}
        description={t("roles.description")}
        {...(selectedRoleId === null
          ? {}
          : {
              breadcrumb: {
                parent: { label: t("roles.title"), href: pathname },
                current: detail.data?.name,
              },
            })}
      />
      <RolesScreen
        roles={list.data ?? []}
        catalogue={catalogue.data ?? []}
        searchLabel={t("roles.searchLabel")}
        noMatch={{
          title: t("roles.noMatch.title"),
          description: t("roles.noMatch.description"),
          clearLabel: tNoMatch("clear"),
        }}
        viewer={props.viewer}
        selectedRoleId={selectedRoleId}
        onSelectRole={selectRole}
        detail={detail.data}
        loading={list.isPending}
        pending={action.isPending || save.isPending}
        error={list.isError ? "The roles could not be read." : undefined}
        onCreateRole={(input) => saveRole(null, input)}
        onUpdateRole={(roleId, input) => saveRole(roleId, input)}
        onRemoveUnavailableKey={(roleId, input) =>
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
    </>
  );
}
