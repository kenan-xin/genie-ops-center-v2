import type { ReactElement } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppError, CORE_ERRORS } from "../src/lib/errors/index.ts";
import type { PermissionKey, Scope } from "../src/lib/module-contract/keys.ts";
import {
  definePage,
  type Module,
  type ModulePageProps,
} from "../src/lib/module-contract/module.ts";
import type { ModuleRPCContext } from "../src/lib/rpc/implement-module.ts";
import { principalFor } from "../src/services/authorization/index.ts";
import {
  matchModulePage,
  type ModulePageMatch,
  openModulePage,
} from "../src/services/module-pages/index.ts";
import {
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "./index.ts";

/** The ids the record loader ran for, in order, so a case proves what loaded and when. */
const loaded: string[] = [];

const Home = () => null;

const RecordView = (
  props: ModulePageProps<{ readonly id: string; readonly by: string }>
) => props.data.id;

const pagesFixture = {
  identity: {
    id: "pages-fixture",
    displayName: "Pages fixture",
    version: "0.0.0",
  },
  schema: {
    tables: {},
    migrations: () => [],
    migrationsTable: "__drizzle_migrations_pages_fixture",
  },
  permissions: [
    { key: "pages-fixture:use", label: "Use the pages fixture" },
    { key: "pages-fixture:read", label: "Read the pages fixture" },
  ],
  recordTypes: [
    {
      type: "pages-fixture-record",
      resolve: async (_ctx, id: string) =>
        id === "gone"
          ? undefined
          : { label: `Record ${id}`, path: `/pages-fixture/${id}` },
    },
  ],
  navigation: {
    pinned: [],
    entries: [
      {
        id: "pages-fixture-home",
        label: "Pages fixture",
        path: "/pages-fixture",
        surface: "workspace",
        requiredPermission: "pages-fixture:use",
      },
    ],
  },
  pages: {
    workspace: [
      definePage({
        path: "/pages-fixture",
        permission: "pages-fixture:use",
        component: Home,
      }),
      definePage({
        path: "/pages-fixture/:id",
        permission: "pages-fixture:use",
        record: { type: "pages-fixture-record", param: "id" },
        load: async (ctx, params) => {
          const id = params["id"] ?? "";

          loaded.push(id);

          if (id === "lost") throw new AppError(CORE_ERRORS["not-found"]);

          return { id, by: ctx.caller.userId };
        },
        component: RecordView,
      }),
    ],
    admin: [],
  },
} satisfies Pick<
  Module,
  "identity" | "schema" | "permissions" | "recordTypes" | "navigation" | "pages"
>;

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([pagesFixture]);
  await markSetupDone(deployment.context);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

beforeEach(() => {
  loaded.length = 0;
});

/** The record page's match for one id. */
function record(id: string): ModulePageMatch {
  const match = matchModulePage(pagesFixture, "workspace", [
    "pages-fixture",
    id,
  ]);

  if (match === undefined) throw new Error(`no page matches ${id}`);

  return match;
}

/** The request context of a new person holding these keys, tenant-wide or on one scope. */
async function personWith(
  keys: readonly PermissionKey[],
  scope?: Scope
): Promise<ModuleRPCContext> {
  const { userId } = await insertPersonWith(deployment.context, keys, scope);
  const tenant = deployment.context;

  return {
    tenant,
    caller: principalFor({
      tenant,
      modules: [pagesFixture],
      userId,
      authenticated: true,
    }),
  };
}

describe("module pages", () => {
  it("refuses a person without the page permission before the loader runs", async () => {
    const ctx = await personWith(["pages-fixture:read"]);

    expect(await openModulePage(ctx, record("r-1"))).toEqual({
      kind: "refused",
    });
    expect(loaded).toEqual([]);
  });

  it("checks a record page on the record, so a grant on one record opens only that record's page", async () => {
    const ctx = await personWith(["pages-fixture:use"], {
      type: "pages-fixture-record",
      id: "r-1",
    });

    expect((await openModulePage(ctx, record("r-1"))).kind).toBe("open");
    expect(await openModulePage(ctx, record("r-2"))).toEqual({
      kind: "refused",
    });
    expect(loaded).toEqual(["r-1"]);
  });

  it("loads a page with its route parameters and renders its component with the loaded data", async () => {
    const ctx = await personWith(["pages-fixture:use"]);

    const opened = await openModulePage(ctx, record("r-3"));

    expect(opened.kind).toBe("open");

    const element: ReactElement | undefined =
      opened.kind === "open" ? opened.element : undefined;

    expect(element?.type).toBe(RecordView);
    expect(element?.props).toEqual({
      params: { id: "r-3" },
      data: { id: "r-3", by: ctx.caller.userId },
    });
  });

  it("answers missing for a record its resolver does not find and for a loader that answers not-found", async () => {
    const ctx = await personWith(["pages-fixture:use"]);

    expect(await openModulePage(ctx, record("gone"))).toEqual({
      kind: "missing",
    });
    expect(await openModulePage(ctx, record("lost"))).toEqual({
      kind: "missing",
    });
    expect(loaded).toEqual(["lost"]);
  });
});
