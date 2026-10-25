"use client";

import {
  type SessionsInput,
  type SignInInput,
  TenantSettingsScreen,
} from "@genie/core/features/settings";
import { type ConfigValue, toast } from "@genie/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation.js";

import { refusalOf, rpc } from "../../../rpc/client.ts";

// A network failure or a non-catalogue answer carries no safe message of its own.
const NOT_SAVED = "That change could not be saved. Try again.";

const savedText = (section: string) =>
  `${section} saved. Written to the audit log.`;

/**
 * The browser half of the Tenant Settings route. The server refused a caller without
 * `core:settings:manage` before this mounts, and every procedure re-checks it; the read holds only
 * the sections the caller may open. The open section lives in the address (`?section=&field=`).
 */
export function SettingsRoute(props: { readonly timeZone: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useTranslations("pages");

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => rpc.settings.read(),
  });

  // Each save answers whether it changed a row; only a change wrote an audit row, so only it toasts.
  const saveWith =
    <Input,>(write: (input: Input) => Promise<{ readonly changed: boolean }>) =>
    async (section: string, input: Input) => {
      try {
        const result = await write(input);

        if (result.changed)
          toast({ tone: "success", title: savedText(section) });
      } catch (cause) {
        const refusal = refusalOf(cause);

        throw { message: refusal.message || NOT_SAVED, issues: refusal.issues };
      } finally {
        await queryClient.invalidateQueries({ queryKey: ["settings"] });
      }
    };

  const signIn = useMutation({
    mutationFn: (input: SignInInput) => rpc.settings.saveSignIn(input),
  });

  const sessions = useMutation({
    mutationFn: (input: SessionsInput) => rpc.settings.saveSessions(input),
  });

  const module = useMutation({
    mutationFn: (input: {
      readonly moduleId: string;
      readonly values: Record<string, ConfigValue>;
    }) => rpc.settings.saveModule(input),
  });

  return (
    <TenantSettingsScreen
      settings={settings.data}
      loading={settings.isPending}
      // A failed background refetch keeps the sections already read; only a first read failure shows.
      error={
        settings.isError && settings.data === undefined
          ? "The settings could not be read."
          : undefined
      }
      target={{
        section: params.get("section") ?? undefined,
        field: params.get("field") ?? undefined,
      }}
      timeZone={props.timeZone}
      modulesHref="/admin/modules"
      localAccountsNotes={{
        managed: t("settings.localAccounts.managed"),
        customer: t("settings.localAccounts.customer"),
      }}
      onSaveSignIn={(input) =>
        saveWith(signIn.mutateAsync)("Sign-in & accounts", input)
      }
      onSaveSessions={(input) =>
        saveWith(sessions.mutateAsync)("Sessions", input)
      }
      onSaveModule={(moduleId, values) =>
        saveWith(module.mutateAsync)(
          settings.data?.modules.find(
            (section) => section.moduleId === moduleId
          )?.title ?? moduleId,
          { moduleId, values }
        )
      }
      onTargetChange={(target) =>
        router.replace(
          `${pathname}?section=${encodeURIComponent(target.section)}`
        )
      }
    />
  );
}
