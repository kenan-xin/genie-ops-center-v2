"use client";

import {
  type ModelKeyInput,
  type ModelSettingsInput,
  type ReportingInput,
  type SessionsInput,
  type SignInInput,
  TenantSettingsScreen,
} from "@genie/core/features/settings";
import type { ConfigValue } from "@genie/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation.js";

import { useAdminWrite } from "../../../rpc/admin-write.ts";
import { rpc } from "../../../rpc/client.ts";

// Each save answers whether it changed a row; only a change wrote an audit row, so only it toasts.
const savedIn = (section: string) => (result: { readonly changed: boolean }) =>
  result.changed ? `${section} saved. Written to the audit log.` : undefined;

// The screen places a refused save's issues under their fields from the rejected save, not a toast.
const onScreen = () => undefined;

/**
 * The browser half of the Tenant Settings route. The server refused a caller without
 * `core:settings:manage` before this mounts, and every procedure re-checks it; the read holds only
 * the sections the caller may open. The open section lives in the address (`?section=&field=`).
 */
export function SettingsRoute(props: { readonly timeZone: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useTranslations("pages");

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => rpc.settings.read(),
  });

  const signIn = useAdminWrite({
    write: (input: Partial<SignInInput>) => rpc.settings.saveSignIn(input),
    invalidate: [["settings"]],
    saved: savedIn("Sign-in & accounts"),
    refused: onScreen,
    notSaved: () => t("settings.notSaved.signIn"),
  });

  const sessions = useAdminWrite({
    write: (input: SessionsInput) => rpc.settings.saveSessions(input),
    invalidate: [["settings"]],
    saved: savedIn("Sessions"),
    refused: onScreen,
    notSaved: () => t("settings.notSaved.sessions"),
  });

  const reporting = useAdminWrite({
    write: (input: ReportingInput) => rpc.settings.saveReporting(input),
    invalidate: [["settings"]],
    saved: savedIn("Reporting"),
    refused: onScreen,
    notSaved: () => t("settings.notSaved.reporting"),
  });

  const models = useAdminWrite({
    write: (input: ModelSettingsInput) =>
      rpc.settings.saveModels({
        ...input,
        allowedModels: [...input.allowedModels],
      }),
    invalidate: [["settings"]],
    saved: savedIn("AI models"),
    refused: onScreen,
    notSaved: () => t("settings.notSaved.models"),
  });

  const keySave = useAdminWrite({
    write: (input: ModelKeyInput) => rpc.settings.saveModelKey(input),
    invalidate: [["settings"]],
    saved: savedIn("AI connection"),
    refused: onScreen,
    notSaved: () => t("settings.notSaved.modelKey"),
  });

  const keyRemoval = useAdminWrite({
    write: () => rpc.settings.removeModelKey(),
    invalidate: [["settings"]],
    saved: (result) =>
      result.changed
        ? "Model provider key removed. Written to the audit log."
        : undefined,
    refused: onScreen,
    notSaved: () => t("settings.notSaved.modelKeyRemoval"),
  });

  const moduleTitle = (moduleId: string) =>
    settings.data?.modules.find((section) => section.moduleId === moduleId)
      ?.title ?? moduleId;

  const module = useAdminWrite({
    write: (input: {
      readonly moduleId: string;
      readonly values: Record<string, ConfigValue | null>;
    }) => rpc.settings.saveModule(input),
    invalidate: [["settings"]],
    saved: (result, input) => savedIn(moduleTitle(input.moduleId))(result),
    refused: onScreen,
    notSaved: (input) =>
      t("settings.notSaved.module", { module: moduleTitle(input.moduleId) }),
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
      onSaveSignIn={async (input) => {
        await signIn.mutateAsync(input);
      }}
      onSaveSessions={async (input) => {
        await sessions.mutateAsync(input);
      }}
      onSaveReporting={async (input) => {
        await reporting.mutateAsync(input);
      }}
      onSaveModels={async (input) => {
        await models.mutateAsync(input);
      }}
      onSaveModelKey={async (input) => {
        await keySave.mutateAsync(input);
      }}
      onRemoveModelKey={async () => {
        await keyRemoval.mutateAsync();
      }}
      onSaveModule={async (moduleId, values) => {
        await module.mutateAsync({ moduleId, values });
      }}
      onTargetChange={(target) =>
        router.replace(
          `${pathname}?section=${encodeURIComponent(target.section)}`
        )
      }
    />
  );
}
