import { createTenantContext, type TenantContext } from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import { insertDashboard } from "@genie/module-analytics/testing";

import { selectedModuleIds } from "../../src/modules.ts";
import { ANALYTICS_CHAT_DASHBOARD } from "../../testing/analytics-chat.ts";
import { RECEIVABLES_OVERVIEW } from "../../testing/receivables-overview.ts";
import {
  ANALYTICS_PEOPLE,
  DEMO_ACCOUNT_EMAIL,
  DEV_DB_PORT,
  DEV_PORT,
} from "./global-setup.ts";

/**
 * What the dashboard spec shares: the demo database's own rows.
 * The chat dashboard gets a fixed id so that the recorded model requests match on every run (D12).
 */

let tenantContext: TenantContext | undefined;

/** The spec process's own tenant context, built as `global-setup.ts` builds one. */
function context(): TenantContext {
  tenantContext ??= createTenantContext(
    {
      DATABASE_URL: `postgres://genie:genie@127.0.0.1:${DEV_DB_PORT}/genie`,
      PUBLIC_URL: `http://127.0.0.1:${DEV_PORT}`,
    },
    silentLogger(),
    selectedModuleIds,
    undefined,
    "core"
  );

  return tenantContext;
}

/** Frees the pool this process's context opened, so Playwright exits without it. */
export async function closeDashboardDatabase(): Promise<void> {
  await tenantContext?.db.$client.end();

  tenantContext = undefined;
}

async function userIdOf(email: string): Promise<string> {
  const { rows } = await context().db.$client.query<{ id: string }>(
    'select id from "user" where email = $1',
    [email]
  );

  const id = rows[0]?.id;

  if (id === undefined)
    throw new Error(`no person matches ${JSON.stringify({ email })}`);

  return id;
}

/** Puts the chat person's fixed dashboard back to an empty one, whatever a killed run left. */
export async function resetChatDashboard(): Promise<void> {
  const ownerUserId = await userIdOf(ANALYTICS_PEOPLE.chat);

  await context().db.$client.query("delete from dashboard where id = $1", [
    ANALYTICS_CHAT_DASHBOARD.id,
  ]);
  // The dashboard page opens the record's last Dashboards chat, and a chat outlives its
  // dashboard, so a fresh dashboard also gets no chat.
  await context().db.$client.query(
    "delete from agent_session where record_id = $1",
    [ANALYTICS_CHAT_DASHBOARD.id]
  );

  await insertDashboard(context(), {
    ...ANALYTICS_CHAT_DASHBOARD,
    ownerUserId,
  });
}

/**
 * Puts the demo account's Receivables overview back to the seeded config, with no views, no
 * default view and no undo, whatever a killed run left. Answers its id.
 */
export async function resetReceivablesOverview(): Promise<string> {
  const ownerUserId = await userIdOf(DEMO_ACCOUNT_EMAIL);

  // The version moves, so a page still open on the old config reads the reset one.
  const { rows } = await context().db.$client.query<{ id: string }>(
    `update dashboard set config = $1, undo = '[]', version = version + 1, updated_at = now()
     where owner_user_id = $2 and name = $3 returning id`,
    [
      JSON.stringify(RECEIVABLES_OVERVIEW.config),
      ownerUserId,
      RECEIVABLES_OVERVIEW.name,
    ]
  );

  const id = rows[0]?.id;

  if (id === undefined)
    throw new Error(`the demo account has no ${RECEIVABLES_OVERVIEW.name}`);

  return id;
}

/** The id of the `customer` row with this name. */
export async function customerIdOf(name: string): Promise<string> {
  const { rows } = await context().db.$client.query<{ id: string }>(
    "select id from customer where lower(btrim(name)) = lower(btrim($1))",
    [name]
  );

  const id = rows[0]?.id;

  if (id === undefined) throw new Error(`no customer matches ${name}`);

  return id;
}

/** Removes the payments a run saved, before and after the test (idempotent setup). */
export async function removeTestPayments(prefix: string): Promise<void> {
  await context().db.$client.query(
    "delete from payment where reference like $1",
    [`${prefix}%`]
  );
}
