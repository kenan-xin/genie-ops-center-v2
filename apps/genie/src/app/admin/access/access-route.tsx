"use client";

import {
  AccessTabs,
  GrantsScreen,
  type GrantsScreenProps,
} from "@genie/core/features/access";
import { PageHeader } from "@genie/core/features/shell";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation.js";
import { useState } from "react";

import { useAdminWrite } from "../../../rpc/admin-write.ts";
import { rpc } from "../../../rpc/client.ts";

/**
 * The browser half of the Access route. The recipient stays in screen state (P18). A prefilled
 * `?module=` or `?role=` link stages its change on the first recipient, and nothing is written
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
        {...(catalogue.isError || recipients.isError || paths.isError
          ? { error: "The access could not be read." }
          : {})}
      />
    </>
  );
}
