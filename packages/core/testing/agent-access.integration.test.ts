import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ModuleRequestContext } from "../src/lib/module-contract/module.ts";
import { agentAccess, chatAvailability } from "../src/services/agent/index.ts";
import { principalFor } from "../src/services/authorization/grant-reader.ts";
import {
  removeIntegrationKey,
  storeIntegrationKey,
} from "../src/services/integrations/keys.ts";
import {
  type DisposableDeployment,
  insertPersonWith,
  insertUser,
  markSetupDone,
  startDisposableDeployment,
  writeModelConnection,
} from "./index.ts";

/** Who sees Ask and the bubble (Spec 7 R-42, R-20, P6, P7), against a real Postgres. */
let deployment: DisposableDeployment;

const ALLOWED = ["openai/gpt-6.1-terra", "anthropic/claude-opus-5.5"];

/** This deployment has no module, so no tool step, no dataset title and no field label. */
const NO_LABELS = { steps: {}, datasets: {}, fields: {} };

beforeAll(async () => {
  deployment = await startDisposableDeployment([]);
  await markSetupDone(deployment.context);
  await writeModelConnection(deployment.context, {
    allowed: ALLOWED,
    chat: "openai/gpt-6.1-terra",
    document: "anthropic/claude-opus-5.5",
  });
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

function contextOf(userId: string): ModuleRequestContext {
  const tenant = deployment.context;

  return {
    tenant,
    caller: principalFor({ tenant, modules: [], userId, authenticated: true }),
  };
}

const person = async (permissions: readonly string[]) =>
  contextOf((await insertPersonWith(deployment.context, permissions)).userId);

/** The model key is read on every call; the settings stay cached, so only the key changes. */
async function withoutKey<T>(read: () => Promise<T>): Promise<T> {
  const actorUserId = (await insertPersonWith(deployment.context, [])).userId;

  await removeIntegrationKey(deployment.context, {
    name: "model-provider",
    actorUserId,
  });

  try {
    return await read();
  } finally {
    await storeIntegrationKey(deployment.context, {
      name: "model-provider",
      value: "sk-or-v1-recorded-model-000000000000000000",
      actorUserId,
    });
  }
}

describe("agentAccess", () => {
  it("permits only a key holder who is not the break-glass account, and says whether AI is on", async () => {
    // An unlimited break-glass session: the one that bypasses can() (R-30).
    const breakGlass = contextOf(
      await insertUser(deployment.context, {
        isBreakGlass: true,
        twoFactorEnabled: true,
      })
    );

    const holder = await person(["core:ask:use"]);

    const manager = await person(["core:ask:use", "core:settings:manage"]);

    const cases = [
      {
        who: "a person without core:ask:use",
        read: async () => agentAccess(await person([])),
        expected: { permitted: false },
      },
      {
        who: "the break-glass account",
        read: () => agentAccess(breakGlass),
        expected: { permitted: false },
      },
      {
        who: "a holder while no key is stored",
        read: () => withoutKey(() => agentAccess(holder)),
        expected: {
          permitted: true,
          ai: "no-key",
          allowedModels: ALLOWED,
          chatModel: "openai/gpt-6.1-terra",
          canPickModel: false,
          inbox: [],
        },
      },
      {
        who: "a holder with the key",
        read: () => agentAccess(holder),
        expected: {
          permitted: true,
          ai: "on",
          allowedModels: ALLOWED,
          chatModel: "openai/gpt-6.1-terra",
          canPickModel: false,
          inbox: [],
        },
      },
      {
        who: "a holder who also manages the settings",
        read: () => agentAccess(manager),
        expected: {
          permitted: true,
          ai: "on",
          allowedModels: ALLOWED,
          chatModel: "openai/gpt-6.1-terra",
          canPickModel: true,
          inbox: [],
        },
      },
    ];

    const answers = [];

    // In order: the key removal must not overlap the other reads.
    for (const { who, read } of cases) {
      // oxlint-disable-next-line no-await-in-loop
      answers.push({ who, access: await read() });
    }

    expect(answers).toEqual(
      cases.map(({ who, expected }) => ({ who, access: expected }))
    );
  });
});

describe("chatAvailability", () => {
  it("offers the model picker only to a person who manages the settings (7.1)", async () => {
    const member = await chatAvailability(await person(["core:ask:use"]));

    const manager = await chatAvailability(
      await person(["core:ask:use", "core:settings:manage"])
    );

    expect({ member, manager }).toEqual({
      member: { kind: "on", models: null, labels: NO_LABELS, suggestions: [] },
      manager: {
        kind: "on",
        models: { allowed: ALLOWED, chatDefault: "openai/gpt-6.1-terra" },
        labels: NO_LABELS,
        suggestions: [],
      },
    });
  });
});
