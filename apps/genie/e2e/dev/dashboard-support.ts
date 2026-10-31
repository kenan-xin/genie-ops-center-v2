import { createTenantContext, type TenantContext } from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import { insertDashboard } from "@genie/module-analytics/testing";

import { selectedModuleIds } from "../../src/modules.ts";
import { ANALYTICS_CHAT_DASHBOARD } from "../../testing/analytics-chat.ts";
import { ANALYTICS_PEOPLE, DEV_DB_PORT, DEV_PORT } from "./global-setup.ts";

/**
 * What the dashboard spec shares: the ledger lock, money in SGD, and the demo database's own rows.
 * The chat dashboard gets a fixed id so that the recorded model requests match on every run (D12).
 */

/** The same lock and wait as S7-09's `dev-support.ts`; the payment changes the shared ledger. */
export const LEDGER_LOCK = "invoices-ledger";

export const LOCK_WAIT = 600_000;

const MONEY = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "SGD",
});

/** SGD as a chart shows it: `SGD 195,200.00`. */
export const sgd = (dollars: number) => MONEY.format(dollars);

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

  await insertDashboard(context(), {
    ...ANALYTICS_CHAT_DASHBOARD,
    ownerUserId,
  });
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
