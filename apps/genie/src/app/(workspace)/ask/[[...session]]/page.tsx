import {
  agentAccess,
  AppError,
  ASK_PERMISSION,
  listOwnSessions,
  type ModuleRequestContext,
  readOwnSession,
} from "@genie/core";
import { PageHeader } from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation.js";

import { requireContext } from "../../../../context.ts";
import { NoAccessMain, renderIfPermitted } from "../../../../page-access.tsx";
import { keepBreakGlassInAdmin } from "../../../../shell-frame.tsx";
import { AskRoute } from "./ask-route.tsx";

export const dynamic = "force-dynamic";

type Props = {
  readonly params: Promise<{ readonly session?: string[] }>;
};

export async function generateMetadata() {
  const tMeta = await getTranslations("pages");

  return { title: tMeta("ask.title") };
}

/** The segment's session; another person's id and an unknown id are the same not-found page. */
async function currentSession(ctx: ModuleRequestContext, id: string) {
  try {
    return await readOwnSession(ctx, id);
  } catch (cause) {
    if (cause instanceof AppError && cause.code === "not-found") notFound();

    throw cause;
  }
}

/**
 * Ask (R-42): the person's own sessions and one conversation, behind `core:ask:use`, with the
 * break-glass account kept in the admin chrome (P7). One optional segment names the session; a
 * second segment, a malformed id or another person's id answers not found. The AI-off message
 * stays for a key holder while AI is off (R-20).
 */
export default async function AskPage(props: Props) {
  const { session = [] } = await props.params;

  if (session.length > 1) notFound();

  await keepBreakGlassInAdmin();

  return renderIfPermitted(ASK_PERMISSION, async (caller) => {
    const ctx: ModuleRequestContext = {
      tenant: requireContext().tenant,
      caller,
    };

    const access = await agentAccess(ctx);

    if (!access.permitted) return <NoAccessMain testId="permission-denied" />;

    const id = session[0];

    const t = await getTranslations("pages");

    const [sessions, branding, current] = await Promise.all([
      listOwnSessions(ctx),
      ctx.tenant.branding.get(),
      id === undefined ? undefined : currentSession(ctx, id),
    ]);

    const aiOn = access.ai === "on";

    return (
      <main>
        <PageHeader title={t("ask.title")} />
        <AskRoute
          sessions={sessions}
          currentId={current?.session.id}
          initialMessages={current?.messages ?? []}
          models={
            aiOn
              ? { allowed: access.allowedModels, chatDefault: access.chatModel }
              : null
          }
          aiOn={aiOn}
          inbox={access.inbox}
          timeZone={branding.defaultTimeZone}
        />
      </main>
    );
  });
}
