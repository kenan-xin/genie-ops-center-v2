"use client";

import {
  AccessTabs,
  GrantsScreen,
  type GrantsScreenProps,
} from "@genie/core/features/access";
import { PageHeader } from "@genie/core/features/shell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation.js";
import { useState } from "react";

import { useAdminWrite } from "../../../rpc/admin-write.ts";
import { rpc } from "../../../rpc/client.ts";
import { useRecordLabels } from "./use-record-labels.ts";

/** A record search answer stays fresh this long, so a retyped query is not read twice. */
const RECORD_SEARCH_STALE_MS = 30_000;

/**
 * The browser half of the Access route. The recipient stays in screen state (P18). A
 * `?recipient=` link picks a listed recipient once and stays out of the URL, so back navigation
 * never switches the recipient (LK1). A prefilled `?module=` or `?role=` link stages its change on
 * the first recipient, and nothing is written
 * before Save (P17). Each save reloads every Access read, and the navigation, which changes when
 * an administrator grants a module to a group they belong to.
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

  const recipients = useQuery({
    queryKey: ["access", "recipients"],
    queryFn: () => rpc.roles.grantRecipients(),
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
        recipients={recipients.data}
        recipient={recipient}
        onRecipientChange={setRecipient}
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
          onSearchRecords: (recordType, query) =>
            queryClient.fetchQuery({
              queryKey: ["access", "records", recordType, query],
              queryFn: () => rpc.roles.scopeRecords({ recordType, query }),
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
        recipients.isError ||
        paths.isError ||
        advancedCatalogue.isError ||
        guards.isError
          ? { error: "The access could not be read." }
          : {})}
      />
    </>
  );
}
