import {
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
  reportingDate,
  withTransaction,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SLIDES_SURFACE } from "../src/agent-surface.ts";
import { slidesModule } from "../src/module.ts";

/**
 * The Slides agent surface's `createRecord` against a real Postgres (Spec 7 R-42b, S7-42): it makes
 * the empty deck inside the handoff's transaction, so a refusal or a rollback leaves no deck.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([slidesModule]);
  await markSetupDone(deployment.context);
  await enableModules(deployment.context, ["slides"]);
  registerModuleRuntime(deployment.context, [slidesModule]);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

async function personWith(
  permissions: readonly string[]
): Promise<ModuleRequestContext> {
  const tenant = deployment.context;

  const { userId } = await insertPersonWith(tenant, permissions);

  return {
    tenant,
    caller: principalFor({
      tenant,
      modules: [slidesModule],
      userId,
      authenticated: true,
    }),
  };
}

/** Each deck of the person with this title: its slides, figures date, Undo length and audit actions. */
async function decksTitled(userId: string, title: string) {
  const { rows } = await deployment.context.db.$client.query(
    `select jsonb_array_length(content->'slides') as slides, frozen_on::text as frozen_on,
       jsonb_array_length(undo) as undo,
       (select coalesce(array_agg(action), '{}') from audit_event where target_id = deck.id::text) as audit
     from deck where owner_user_id = $1 and title = $2`,
    [userId, title]
  );

  return rows;
}

describe("the Slides agent surface", () => {
  it("createRecord makes an empty deck of the person in the given transaction, frozen on the reporting date, with no Undo entry and one created audit row, and a rolled back transaction leaves none", async () => {
    const owner = await personWith([
      "slides:use",
      "slides:read",
      "slides:write",
    ]);

    await withTransaction(deployment.context, (tx) =>
      SLIDES_SURFACE.createRecord(owner, tx, { title: "October review" })
    );

    expect(await decksTitled(owner.caller.userId, "October review")).toEqual([
      {
        slides: 0,
        frozen_on: await reportingDate(deployment.context),
        undo: 0,
        audit: ["slides:deck-created"],
      },
    ]);

    await expect(
      withTransaction(deployment.context, async (tx) => {
        await SLIDES_SURFACE.createRecord(owner, tx, {
          title: "Rolled back review",
        });

        throw new Error("the handoff failed after the deck");
      })
    ).rejects.toThrow("the handoff failed after the deck");

    expect(
      await decksTitled(owner.caller.userId, "Rolled back review")
    ).toEqual([]);
  });

  it("createRecord refuses a person without slides:write and makes nothing", async () => {
    const reader = await personWith(["slides:use", "slides:read"]);

    await expect(
      withTransaction(deployment.context, (tx) =>
        SLIDES_SURFACE.createRecord(reader, tx, { title: "Reader's review" })
      )
    ).rejects.toMatchObject({ code: "forbidden" });

    expect(await decksTitled(reader.caller.userId, "Reader's review")).toEqual(
      []
    );
  });
});
