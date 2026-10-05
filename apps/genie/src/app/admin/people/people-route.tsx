"use client";

import {
  PeopleScreen,
  type NewPersonInput,
  type PeopleSettings,
  type PeopleViewer,
} from "@genie/core/features/people";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useState } from "react";

import { trpc } from "../../../trpc/client.ts";
import type { AppRouter } from "../../../trpc/root.ts";

/** What a write returns: an id for a create, nothing for the rest. */
type WriteResult = void | {
  readonly id: string;
  /** False on Add person when the expected email did not go out (N1). */
  readonly emailSent?: boolean;
};

/** A refused write as the tRPC client hands it over: the safe message and the envelope data. */
type RefusalError = TRPCClientError<AppRouter>;

/**
 * The catalogue message for a refused write, with the whole minutes on a rate-limit refusal
 * (R-21). The tRPC formatter already carried the safe message and the minutes, so the screen shows
 * the same reason the server refused with.
 */
function refusalMessage(error: RefusalError): string {
  const minutes = error.data?.retryAfterMinutes;

  const message =
    error.message === "" ? "The action could not be completed." : error.message;

  return minutes === undefined
    ? message
    : `${message} Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/**
 * The browser half of the People route. The server has already refused a caller without
 * `core:people:manage` before this mounts, and every procedure re-checks it, so the screen holds
 * no denied state. It owns the selection, the writes and the refusal message, and reloads the list
 * and the open detail through TanStack Query after each one.
 */
export function PeopleRoute(props: {
  readonly viewer: PeopleViewer;
  readonly settings: PeopleSettings;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);

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

  const capabilities = useQuery({
    queryKey: ["people", "capabilities"],
    queryFn: () => trpc.people.capabilities.query(),
  });

  const action = useMutation<
    WriteResult,
    RefusalError,
    () => Promise<WriteResult>
  >({
    mutationFn: (work) => work(),
    onSuccess: async () => {
      setError(undefined);
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      await queryClient.invalidateQueries({ queryKey: ["person", selectedId] });
    },
    onError: (refusal) => setError(refusalMessage(refusal)),
  });

  const run = (work: () => Promise<WriteResult>) => {
    setError(undefined);
    setNotice(undefined);
    action.mutate(work);
  };

  // Add person resolves only on success, so the dialog stays open on a refusal and shows it. A
  // committed add whose email did not go out is a partial success: the dialog closes and a status
  // notice points at Resend (N1).
  const addPerson = (input: NewPersonInput): Promise<void> => {
    setError(undefined);
    setNotice(undefined);

    return action
      .mutateAsync(() =>
        trpc.people.add.mutate({ ...input, roleIds: [...input.roleIds] })
      )
      .then((result) => {
        if (
          result !== undefined &&
          "emailSent" in result &&
          result.emailSent === false
        ) {
          setNotice("Person added; the email was not sent. Use Resend.");
        }
      });
  };

  return (
    <PeopleScreen
      people={list.data ?? []}
      viewer={props.viewer}
      settings={props.settings}
      roles={roles.data ?? []}
      canAssignRoles={capabilities.data?.canAssignRoles ?? true}
      loading={list.isPending}
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
      onSelectPerson={setSelectedId}
      onAddPerson={addPerson}
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
