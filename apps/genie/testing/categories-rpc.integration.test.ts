import {
  type CategoriesContract,
  createRequestPrincipal,
  type PermissionKey,
} from "@genie/core";
import { insertUser, startDisposableDeployment } from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createRpcHandler,
  RPC_PREFIX,
  type RequestContext,
} from "../src/rpc/handler.ts";
import { createAppRouter } from "../src/rpc/router.ts";
import {
  createServerRpcClient,
  rpcFailureOf,
} from "../src/rpc/server-client.ts";

/**
 * The Categories procedures through the app's RPC handler and the browser's encoding, against a
 * real Postgres (R-87 to R-90a): each of the five decodes its input and reaches the service, and
 * each answers `forbidden` at 403 to a caller without `core:settings:manage`, not only `remove`.
 */
const REQUEST_ID = "req-categories-rpc-test";

const MODULES = [placeholderModule];

const handler = createRpcHandler(createAppRouter(MODULES), () => undefined);

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let actorUserId: string;

beforeAll(async () => {
  deployment = await startDisposableDeployment(MODULES);
  actorUserId = await insertUser(deployment.context, { name: "Admin" });
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

function client(keys: readonly PermissionKey[]) {
  const answer = async (request: Request): Promise<Response> => {
    const context: RequestContext = {
      tenant: deployment.context,
      requestId: REQUEST_ID,
      caller: createRequestPrincipal(
        { userId: actorUserId, groups: [], authenticated: true },
        () => Promise.resolve({ keys: new Set(keys), scopes: new Map() })
      ),
    };

    const result = await handler.handle(request, {
      prefix: RPC_PREFIX,
      context,
    });

    if (!result.matched) throw new Error(`no procedure matched ${request.url}`);

    return result.response;
  };

  return createServerRpcClient<{ categories: CategoriesContract }>({
    url: `http://genie.test${RPC_PREFIX}`,
    fetch: answer,
  }).categories;
}

async function names(api: ReturnType<typeof client>): Promise<string[]> {
  return (await api.list()).categories.map((row) => row.name);
}

describe("the categories RPC", () => {
  it("creates, renames, reorders, lists and removes a category, each with its one audit row", async () => {
    const api = client(["core:settings:manage"]);

    const { id: financeId } = await api.create({ name: "Finance" });
    const { id: opsId } = await api.create({ name: "Operations" });

    await api.rename({ categoryId: financeId, name: "Money" });
    await api.reorder({ orderedIds: [opsId, financeId] });

    expect(await names(api)).toEqual(["Operations", "Money"]);

    await api.remove({ categoryId: opsId });

    expect(await names(api)).toEqual(["Money"]);

    const { rows } = await deployment.context.db.$client.query<{
      action: string;
      target_id: string | null;
    }>(
      "select action, target_id from audit_event where action like 'core:category_%' order by occurred_at, id"
    );

    expect(rows).toEqual([
      { action: "core:category_created", target_id: financeId },
      { action: "core:category_created", target_id: opsId },
      { action: "core:category_renamed", target_id: financeId },
      { action: "core:category_reordered", target_id: null },
      { action: "core:category_deleted", target_id: opsId },
    ]);
  });

  it("refuses every procedure at 403 to a caller without core:settings:manage, before it parses the input", async () => {
    const api = client(["core:roles:manage"]);

    const calls = {
      list: api.list(),
      create: api.create({ name: "" }),
      rename: api.rename({ categoryId: "x", name: "" }),
      reorder: api.reorder({ orderedIds: ["x"] }),
      remove: api.remove({ categoryId: "x" }),
    } satisfies Record<keyof CategoriesContract, Promise<unknown>>;

    const answers = await Promise.all(
      Object.entries(calls).map(async ([procedure, call]) => {
        const failure = rpcFailureOf(
          await call.then(
            () => undefined,
            (cause: unknown) => cause
          )
        );

        return [procedure, failure?.status, failure?.code];
      })
    );

    expect(answers).toEqual(
      Object.keys(calls).map((procedure) => [procedure, 403, "forbidden"])
    );
  });
});
