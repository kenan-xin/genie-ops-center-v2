import {
  createTenantContext,
  type TenantContext,
  withTransaction,
} from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import { insertDeck } from "@genie/module-slides/testing";

import { selectedModuleIds } from "../../src/modules.ts";
import {
  SLIDES_CHANGE_CONTENT,
  SLIDES_CHANGE_DECK_ID,
  SLIDES_CHANGE_DECK_TITLE,
  SLIDES_CHANGE_FROZEN_ON,
} from "../../testing/slides-change.ts";
import { DEV_DB_PORT, DEV_PORT } from "./global-setup.ts";

/** The stored deck content, as the factory takes it. */
export type DeckContent = NonNullable<
  Parameters<typeof insertDeck>[1]["content"]
>;

/**
 * What the slides spec shares: the demo database's own rows. The chat person's decks are removed
 * before and after a test, because a killed run must not leave a deck the next one reads (D16).
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
export async function closeSlidesDatabase(): Promise<void> {
  await tenantContext?.db.$client.end();

  tenantContext = undefined;
}

/** How many Undo entries the stored deck holds: one per save that reached the database. */
export async function undoLengthOf(id: string): Promise<number> {
  const { rows } = await context().db.$client.query<{ length: number }>(
    "select jsonb_array_length(undo) as length from deck where id = $1",
    [id]
  );

  return rows[0]?.length ?? 0;
}

/**
 * Mirrors `noOverflow` in `slide-canvas.stories.tsx` (B4.2), for one slide canvas: every box that
 * is not a chart, and every descendant that clips or scrolls, must not hide content. A table's
 * rows sit in a scrolling child, so the box's own size is not enough. This runs inside the page.
 */
export function slideOverflowFailures(canvas: HTMLElement): readonly string[] {
  const failures: string[] = [];

  for (const element of canvas.querySelectorAll<HTMLElement>(
    "[data-slide-box]"
  )) {
    if (element.dataset["slideBox"] === "chart") continue;

    const label = element.dataset["slideBox"] ?? "box";

    if (element.scrollWidth > element.clientWidth + 1) {
      failures.push(`${label} overflows horizontally`);
    } else if (element.scrollHeight > element.clientHeight + 1) {
      failures.push(`${label} overflows vertically`);
    }

    for (const child of element.querySelectorAll<HTMLElement>("*")) {
      // The 1 x 1 sr-only node of a table caption clips on purpose; it is not slide content.
      if (child.clientWidth <= 1 && child.clientHeight <= 1) continue;

      const style = getComputedStyle(child);

      const clips = [style.overflowX, style.overflowY].some(
        (value) => value !== "visible"
      );

      if (!clips) continue;

      const name = child.tagName.toLowerCase();

      if (child.scrollWidth > child.clientWidth + 1) {
        failures.push(`${label} hides content inside ${name} (horizontally)`);
      } else if (child.scrollHeight > child.clientHeight + 1) {
        failures.push(`${label} hides content inside ${name} (vertically)`);
      }
    }
  }

  return failures;
}

/**
 * Puts the fixed deck of `slides-change.ts` back for this person, whatever a killed run left, so
 * the recorded requests of the deck editor's chat match (D12). A spec with no chat may pass other
 * content, such as the deck with speaker notes. Call it under the ledger lock.
 */
export async function resetChangeDeck(
  email: string,
  // SAFETY: the fixture holds the stored deck shape; the store's parse refuses any other.
  content: DeckContent = SLIDES_CHANGE_CONTENT as never
): Promise<void> {
  const tenant = context();

  const { rows } = await tenant.db.$client.query<{ id: string }>(
    'select id from "user" where email = $1',
    [email]
  );

  const ownerUserId = rows[0]?.id;

  if (ownerUserId === undefined)
    throw new Error(`no person matches ${JSON.stringify({ email })}`);

  await tenant.db.$client.query("delete from deck where id = $1", [
    SLIDES_CHANGE_DECK_ID,
  ]);
  // The deck page opens the record's last Slides chat, and a chat outlives its deck, so a fresh
  // deck also gets no chat: the next message starts the recorded first turn again.
  await tenant.db.$client.query(
    "delete from agent_session where record_id = $1",
    [SLIDES_CHANGE_DECK_ID]
  );
  await insertDeck(tenant, {
    ownerUserId,
    id: SLIDES_CHANGE_DECK_ID,
    title: SLIDES_CHANGE_DECK_TITLE,
    content,
    frozenOn: SLIDES_CHANGE_FROZEN_ON,
  });
}

/**
 * Deletes every deck this person owns with its image and export files, in one transaction, so a
 * later run starts from an empty list (D16). A person the setup has not made yet owns none, which
 * is the red run before the chat person exists.
 */
export async function removeOwnDecks(email: string): Promise<void> {
  const tenant = context();

  const { rows: people } = await tenant.db.$client.query<{ id: string }>(
    'select id from "user" where email = $1',
    [email]
  );

  const ownerUserId = people[0]?.id;

  if (ownerUserId === undefined) return;

  await withTransaction(tenant, async (tx) => {
    // The id came from the `user` row just read, so it needs no bind parameter.
    const deleted = await tx.execute<{
      image_file_ids: readonly string[];
      export_file_id: string | null;
    }>(
      `delete from deck
       where owner_user_id = '${ownerUserId}'
       returning image_file_ids, export_file_id`
    );

    const fileIds: string[] = [];

    for (const row of deleted.rows) {
      fileIds.push(...row.image_file_ids);

      if (row.export_file_id !== null) fileIds.push(row.export_file_id);
    }

    // The file rows and their bytes go on the same transaction, as deleteDeck removes them.
    await tenant.fileStorage.remove(fileIds, tx);
  });
}
