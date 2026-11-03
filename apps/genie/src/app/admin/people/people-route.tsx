"use client";

import { accessHref } from "@genie/core/features/access";
import {
  PeopleScreen,
  type NewPersonInput,
  type PeopleSettings,
  type PeopleViewer,
} from "@genie/core/features/people";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation.js";
import { useState } from "react";

import { useAdminWrite } from "../../../rpc/admin-write.ts";
import { type Refusal, rpc } from "../../../rpc/client.ts";
import { useInspectorAccess } from "../access/use-inspector-access.ts";

/**
 * The browser half of the People route. The server has already refused a caller without
 * `core:people:manage` before this mounts, and every procedure re-checks it, so the screen holds
 * no denied state. It owns the selection, the writes and the refusal message, and reloads the list
 * and the open detail through TanStack Query after each one. Only a viewer with
 * `core:roles:manage` reads the person's access and gets the link into Access (LK4, LK5).
 */
export function PeopleRoute(props: {
  readonly viewer: PeopleViewer;
  readonly settings: PeopleSettings;
  readonly canManageAccess: boolean;
}) {
  const t = useTranslations("pages");
  const router = useRouter();
  const tNoMatch = useTranslations("noMatch");
  // An audit target link opens the screen with its person selected.
  const initialSelectedId = useSearchParams().get("selected") ?? undefined;
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? null);
  // The detail is read only while the sheet is open; a close keeps `selectedId` for the exit.
  const [open, setOpen] = useState(initialSelectedId !== undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const list = useQuery({
    queryKey: ["people"],
    queryFn: () => rpc.people.list(),
  });

  const detail = useQuery({
    queryKey: ["person", selectedId],
    queryFn: () => rpc.people.get({ personId: selectedId ?? "" }),
    enabled: selectedId !== null && open,
  });

  const roles = useQuery({
    queryKey: ["people", "assignable-roles"],
    queryFn: () => rpc.people.assignableRoles(),
  });

  const capabilities = useQuery({
    queryKey: ["people", "capabilities"],
    queryFn: () => rpc.people.capabilities(),
  });

  const canManageGroups = capabilities.data?.canManageGroups === true;

  const access = useInspectorAccess({
    canManageAccess: props.canManageAccess,
    recipient: selectedId === null ? null : { type: "user", id: selectedId },
    open,
  });

  // The local groups the person's Add to group offers, read only for a caller who manages groups.
  const groups = useQuery({
    queryKey: ["groups", false],
    queryFn: () => rpc.groups.list({ includeArchived: false }),
    enabled: canManageGroups,
  });

  const localGroups = (groups.data ?? [])
    .filter((group) => group.source === "local")
    .map((group) => ({
      id: group.id,
      label: group.displayLabel ?? group.name,
    }));

  // A status write's refusal shows on the page. Its message already carries the wait of a
  // rate-limit refusal (R-21).
  const action = useAdminWrite({
    write: (work: () => Promise<void>) => work(),
    // Disable, Remove and a group change alter the person's paths, so the Access tab reloads too.
    invalidate: [["people"], ["person", selectedId], ["access"]],
    refused: (refusal: Refusal) => setError(refusal.message),
  });

  const add = useAdminWrite({
    write: (input: NewPersonInput) =>
      rpc.people.add({ ...input, roleIds: [...input.roleIds] }),
    invalidate: [["people"]],
    // A committed add whose email did not go out is a partial success: a status notice points at
    // Resend instead (N1). Only a full add gets its own toast (PD-13).
    saved: (result) =>
      result.emailSent === false ? undefined : "Person added",
    // The Add person dialog awaits the write and shows the refusal it rejects with (U-1).
    refused: () => undefined,
    notSaved: () => t("people.notAdded"),
  });

  // The status writes return nothing the screen reads, so their answer is dropped here.
  const run = <TResult,>(work: () => Promise<TResult>) => {
    setError(undefined);
    setNotice(undefined);
    action.mutate(async () => {
      await work();
    });
  };

  // Add person resolves only on success, so the dialog stays open on a refusal and shows it. A
  // partial success closes the dialog and shows the notice.
  const addPerson = (input: NewPersonInput): Promise<void> => {
    setError(undefined);
    setNotice(undefined);

    return add.mutateAsync(input).then((result) => {
      if (result.emailSent === false)
        setNotice("Person added; the email was not sent. Use Resend.");
    });
  };

  return (
    <PeopleScreen
      people={list.data ?? []}
      viewer={props.viewer}
      settings={props.settings}
      searchLabel={t("people.searchLabel")}
      noMatch={{
        title: t("people.noMatch.title"),
        description: t("people.noMatch.description"),
        clearLabel: tNoMatch("clear"),
      }}
      roles={roles.data ?? []}
      canAssignRoles={capabilities.data?.canAssignRoles ?? true}
      loading={list.isPending}
      pending={action.isPending || add.isPending}
      error={
        error ?? (list.isError ? "The people could not be read." : undefined)
      }
      notice={notice}
      lastAdministratorPersonIds={
        detail.data?.lastAdministrator === true && selectedId !== null
          ? [selectedId]
          : []
      }
      details={
        detail.data === undefined ? {} : { [detail.data.id]: detail.data }
      }
      initialSelectedId={initialSelectedId}
      // A close keeps the last detail, so the sheet closes through `open` and returns focus (R-22).
      // Opening another person switches the key, and the screen shows nothing until it loads.
      onSelectPerson={(personId) => {
        setOpen(personId !== null);

        if (personId !== null) setSelectedId(personId);
      }}
      onAddPerson={addPerson}
      onDisablePerson={(personId) =>
        run(() => rpc.people.disable({ personId }))
      }
      onEnablePerson={(personId) => run(() => rpc.people.enable({ personId }))}
      onRemovePerson={(personId) => run(() => rpc.people.remove({ personId }))}
      onResendSetPassword={(personId) =>
        run(() => rpc.people.resendSetPassword({ personId }))
      }
      onResendInvitation={(personId) =>
        run(() => rpc.people.resendInvitation({ personId }))
      }
      localGroups={canManageGroups ? localGroups : undefined}
      onAddToGroup={
        canManageGroups
          ? (personId, groupId) =>
              run(() => rpc.groups.addMembers({ groupId, userIds: [personId] }))
          : undefined
      }
      onRemoveFromGroup={
        canManageGroups
          ? (personId, groupId) =>
              run(() =>
                rpc.groups.removeMembers({ groupId, userIds: [personId] })
              )
          : undefined
      }
      onOpenGroup={(groupId) =>
        router.push(`/admin/groups?selected=${encodeURIComponent(groupId)}`)
      }
      access={access}
      onManageAccess={
        props.canManageAccess
          ? (personId) => router.push(accessHref({ recipient: personId }))
          : undefined
      }
    />
  );
}
