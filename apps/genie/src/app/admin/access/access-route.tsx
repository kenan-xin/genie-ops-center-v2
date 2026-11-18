"use client";

import {
  AccessTabs,
  GRANTS_LIST,
  grantsListInput,
  GrantsScreen,
  type GrantsScreenProps,
} from "@genie/core/features/access";
import { PageHeader } from "@genie/core/features/shell";
import { useListState } from "@genie/ui";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation.js";
import { useState } from "react";

import { useAdminWrite } from "../../../rpc/admin-write.ts";
import { rpc } from "../../../rpc/client.ts";
import { useRecordLabels } from "./use-record-labels.ts";

/** A record search answer stays fresh this long, so a retyped query is not read twice. */
const RECORD_SEARCH_STALE_MS = 30_000;

/** The Grants list's page (P12-17). */
const LIST_PAGE = 25;

const searchRecipients = (query: string) =>
  rpc.roles.recipients({ query, limit: 10 });

/** One recipient by id, an archived group too (an old `?recipient=` link, an "Assigned via" group). */
const lookupRecipient = async (id: string) =>
  (await rpc.roles.recipients({ ids: [id], archived: true, limit: 1 }))
    .rows[0] ?? null;

/**
 * The browser half of the Grants route. The recipient stays in screen state (LK1): a
 * `?recipient=` link opens it once and stays out of state, so back navigation never switches it.
 * The list's search and Show filter live in the address. A prefilled `?module=` or `?role=` link
 * stages its change on the first recipient, and nothing is written before Save (P17). Each save
 * reloads every Access read, the list's counts too, and the navigation.
 */
export function AccessRoute() {
  const t = useTranslations("pages");

  const search = useSearchParams();

  const [recipient, setRecipient] =
    useState<GrantsScreenProps["recipient"]>(null);

  const catalogue = useQuery({
    queryKey: ["access", "catalogue"],
    queryFn: () => rpc.roles.grantCatalogue(),
  });

  const listState = useListState(GRANTS_LIST);

  const { query, kind } = grantsListInput(listState.params);

  const listKey = JSON.stringify([query, kind]);

  // The offset belongs to one search and filter; a change starts at the first page.
  const [at, setAt] = useState({ key: listKey, offset: 0 });

  const offset = at.key === listKey ? at.offset : 0;

  const list = useQuery({
    queryKey: ["access", "recipients", kind, query, offset],
    queryFn: () =>
      rpc.roles.recipients({
        archived: true,
        kind,
        query,
        offset,
        limit: LIST_PAGE,
      }),
    placeholderData: keepPreviousData,
    enabled: recipient === null,
  });

  const paths = useQuery({
    queryKey: ["access", recipient?.type, recipient?.id],
    queryFn: () =>
      rpc.roles.recipientAccess({
        principalType: recipient?.type ?? "group",
        principalId: recipient?.id ?? "",
      }),
    enabled: recipient !== null,
  });

  const queryClient = useQueryClient();

  const advancedCatalogue = useQuery({
    queryKey: ["access", "advanced", "catalogue"],
    queryFn: () => rpc.roles.advancedCatalogue(),
  });

  const guards = useQuery({
    queryKey: ["access", "advanced", "guards", recipient?.type, recipient?.id],
    queryFn: () =>
      rpc.roles.administratorGuards({
        principalType: recipient?.type ?? "group",
        principalId: recipient?.id ?? "",
      }),
    enabled: recipient !== null,
  });

  const recordLabels = useRecordLabels(paths.data);

  // The screen awaits the save and shows the refusal in its pending bar, so a refusal gets no toast.
  const save = useAdminWrite({
    write: (work: () => Promise<void>) => work(),
    invalidate: [["access"]],
    refresh: true,
    refused: () => undefined,
    notSaved: () => t("access.notSaved"),
  });

  return (
    <>
      <PageHeader
        title={t("access.title")}
        description={t("access.description")}
      />
      <AccessTabs current="grants" />
      <GrantsScreen
        catalogue={catalogue.data}
        recipient={recipient}
        onRecipientChange={setRecipient}
        search={searchRecipients}
        lookup={lookupRecipient}
        list={{
          state: listState,
          page:
            list.data === undefined
              ? undefined
              : {
                  rows: list.data.rows,
                  from: offset + 1,
                  total: list.data.total,
                  hasPrevious: offset > 0,
                  hasNext: offset + list.data.rows.length < list.data.total,
                },
          onPage: (step) =>
            setAt({
              key: listKey,
              offset: Math.max(0, offset + step * LIST_PAGE),
            }),
          paging: list.isPlaceholderData,
        }}
        paths={paths.data}
        link={{
          recipient: search.get("recipient") ?? undefined,
          module: search.get("module") ?? undefined,
          role: search.get("role") ?? undefined,
        }}
        onSave={(changes) =>
          save.mutateAsync(async () => {
            if (recipient === null) return;

            await rpc.roles.saveGrants({
              principalType: recipient.type,
              principalId: recipient.id,
              add: [...changes.add],
              change: [...changes.change],
              remove: [...changes.remove],
            });
          })
        }
        advanced={{
          catalogue: advancedCatalogue.data,
          guards: guards.data,
          onSearchRecords: (recordType, term) =>
            queryClient.fetchQuery({
              queryKey: ["access", "records", recordType, term],
              queryFn: () =>
                rpc.roles.scopeRecords({ recordType, query: term }),
              staleTime: RECORD_SEARCH_STALE_MS,
            }),
          onSave: (changes) =>
            save.mutateAsync(async () => {
              if (recipient === null) return;

              await rpc.roles.saveAdvanced({
                principalType: recipient.type,
                principalId: recipient.id,
                add: [...changes.add],
                remove: [...changes.remove],
              });
            }),
        }}
        recordLabels={recordLabels}
        {...(catalogue.isError ||
        list.isError ||
        paths.isError ||
        advancedCatalogue.isError ||
        guards.isError
          ? { error: "The access could not be read." }
          : {})}
      />
    </>
  );
}
