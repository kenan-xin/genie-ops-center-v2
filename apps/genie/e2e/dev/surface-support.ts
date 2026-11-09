import type { TenantContext } from "@genie/core";
import { insertDashboard } from "@genie/module-analytics/testing";

import { devTenant } from "./chat-seed.ts";

/**
 * What the surface spec shares: the session that Ask handed over to, and the person's dashboards.
 * Decks go through `slides-support.ts`.
 */

let tenantContext: TenantContext | undefined;

const context = () => (tenantContext ??= devTenant());

/** Frees the pool this process's context opened, so Playwright exits without it. */
export async function closeSurfaceDatabase(): Promise<void> {
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

export type HandedOver = {
  readonly id: string;
  readonly title: string;
  readonly recordId: string;
};

/** The session that the Ask chat `askId` handed over to, or undefined before the handoff. */
export async function handedOverFrom(
  askId: string
): Promise<HandedOver | undefined> {
  const { rows } = await context().db.$client.query<HandedOver>(
    'select id, title, record_id as "recordId" from agent_session where handed_from_session_id = $1',
    [askId]
  );

  return rows[0];
}

/**
 * Deletes the person's dashboards with these names, so a killed run never leaves a name that
 * `createRecord` refuses as taken.
 */
export async function removeDashboardsNamed(
  email: string,
  names: readonly string[]
): Promise<void> {
  await context().db.$client.query(
    "delete from dashboard where owner_user_id = $1 and name = any($2)",
    [await userIdOf(email), names]
  );
}

/** An empty dashboard of the person's own, by name; answers its id. */
export async function insertEmptyDashboard(
  email: string,
  name: string
): Promise<string> {
  return insertDashboard(context(), {
    ownerUserId: await userIdOf(email),
    name,
  });
}
