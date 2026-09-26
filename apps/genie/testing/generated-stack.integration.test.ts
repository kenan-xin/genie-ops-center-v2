import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  generateTenantDeploy,
  startGeneratedStack,
} from "./generated-stack-process.ts";
import { buildImageWith, removeImage, requireDocker } from "./image-process.ts";

const SLUG = `smoke-${process.pid}-${Date.now()}`;

const IMAGE_TAG = `genie-s1-05-${process.pid}-${Date.now()}:test`;

describe("the generated customer stack smoke", () => {
  let stack: Awaited<ReturnType<typeof startGeneratedStack>> | undefined;
  let generated: Awaited<ReturnType<typeof generateTenantDeploy>> | undefined;

  beforeAll(async () => {
    await requireDocker();
    generated = await generateTenantDeploy(SLUG);
    expect(generated.moduleInclude).toBe("");
    await buildImageWith(generated.moduleInclude, IMAGE_TAG);
    stack = await startGeneratedStack({
      slug: SLUG,
      imageTag: IMAGE_TAG,
      compose: generated.compose,
      envExample: generated.envExample,
    });
  }, 900000);

  afterAll(async () => {
    await stack?.stop();
    await generated?.remove();
    await removeImage(IMAGE_TAG);
  });

  it("serves the customer page and health while the excluded placeholder module is absent", async () => {
    if (stack === undefined) throw new Error("generated stack did not start");

    const deadline = Date.now() + 120000;
    let health: Response | undefined;

    /* eslint-disable no-await-in-loop */
    while (Date.now() < deadline) {
      health = await stack.request("/api/health").catch(() => undefined);

      if (health?.status === 200) break;

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    /* eslint-enable no-await-in-loop */

    expect(
      health?.status,
      "generated app never served its health endpoint"
    ).toBe(200);
    await stack.markSetupDone();

    const readyHealth = await stack.request("/api/health");

    const page = await stack.request("/");

    const excludedRoutes = [
      "/placeholder",
      "/placeholder/archive",
      "/placeholder/retired",
      "/admin/placeholder",
      "/viewer/placeholder",
      "/m/placeholder",
      "/admin/m/placeholder",
      "/api/trpc/placeholder.read?input=%7B%7D",
      "/api/m/placeholder/fixture/hooks",
    ];

    const tableNames = await stack.tableNames();

    expect(await readyHealth.text()).toBe("ok");

    expect(page.status).toBe(200);

    expect(page.headers.get("content-type")).toContain("text/html");

    expect(await page.text()).toContain("<main");

    // R-31 distinguishes module absence from a compiled module refusing access.
    /* eslint-disable no-await-in-loop */
    for (const route of excludedRoutes) {
      expect(
        await stack.request(route).then(({ status }) => status),
        route
      ).toBe(404);
    }
    /* eslint-enable no-await-in-loop */

    expect(tableNames).not.toContain("placeholder_record");

    expect(tableNames).not.toContain("__drizzle_migrations_placeholder");
  }, 240000);
});
