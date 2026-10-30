import {
  createTenantContext,
  type ModuleRPCContext,
  matchModulePage,
  type OpenedModulePage,
  openModulePage,
  principalFor,
  registerModuleRuntime,
  type TenantContext,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invoicesModule } from "../src/module.ts";
import type { InvoiceListView } from "../src/presentation/views.ts";
import { insertCustomer, insertInvoice } from "./factories.ts";

/**
 * The module's pages through core's `openModulePage`, on a deployment at reporting date
 * 2026-10-27. Tasks 4 and 5 add the record and payments cases here.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

/** A context built after the reporting date was set, so its settings reader sees it (DEC-46). */
let tenant: TenantContext;

const t = () => deployment.context;

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  await markSetupDone(t());
  await enableModules(t(), ["invoices"]);
  await t().db.$client.query(
    "update tenant_settings set reporting_date = '2026-10-27'"
  );
  tenant = createTenantContext(
    {
      DATABASE_URL: t().env.databaseUrl,
      PUBLIC_URL: t().env.publicUrl,
    },
    { error: () => {}, info: () => {}, debug: () => {} },
    ["invoices"]
  );
  registerModuleRuntime(tenant, [invoicesModule]);
}, 120000);

afterAll(async () => {
  await tenant?.db.$client.end();
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

function contextFor(userId: string): ModuleRPCContext {
  return {
    tenant,
    caller: principalFor({
      tenant,
      modules: [invoicesModule],
      userId,
      authenticated: true,
    }),
  };
}

/** The page core opens for these decoded segments, for this person. */
function openPage(
  userId: string,
  segments: readonly string[]
): Promise<OpenedModulePage> {
  const match = matchModulePage(invoicesModule, "workspace", segments);

  if (match === undefined) {
    throw new Error(`no page matches ${segments.join("/")}`);
  }

  return openModulePage(contextFor(userId), match);
}

describe("invoice pages", () => {
  it("the list answers only the customer a scoped reader may read", async () => {
    const [a, b] = await Promise.all([
      insertCustomer(t()),
      insertCustomer(t()),
    ]);

    if (a === undefined || b === undefined) throw new Error("no customers");

    const visible = await insertInvoice(t(), {
      customerId: a.id,
      number: "INV-A",
    });

    await insertInvoice(t(), { customerId: b.id, number: "INV-B" });

    const { userId } = await insertPersonWith(
      t(),
      ["invoices:use", "invoices:read"],
      { type: "invoices-customer", id: a.id }
    );

    const opened = await openPage(userId, ["m", "invoices", "invoices"]);

    if (opened.kind !== "open") {
      throw new Error(`the list page answered ${opened.kind}`);
    }

    // SAFETY: core renders the list page with `data` set to the loader's InvoiceListView.
    const data = (opened.element.props as { readonly data: InvoiceListView })
      .data;

    expect(data.rows.map((row) => row.id)).toEqual([visible.id]);
  });
});
