import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { compose, HOST_PORT } from "./setup-gate/stack.ts";

const BASE_URL = `http://127.0.0.1:${HOST_PORT}`;

const ROUTES = ["/", "/placeholder", "/viewer/placeholder"] as const;

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

async function completeKnownSteps(): Promise<void> {
  await compose([
    "exec",
    "-T",
    "database",
    "psql",
    "-U",
    "genie",
    "-d",
    "genie",
    "-c",
    "insert into tenant_module (module_id, enabled) values ('placeholder', true) on conflict (module_id) do update set enabled = true; insert into setup_step (step, state) values ('migrations', 'done'), ('seed', 'done'), ('realm', 'done'), ('clients', 'done') on conflict (step) do update set state = 'done', detail = null, updated_at = now()",
  ]);
}

test("AC-2: three routes switch from not-set-up to normal at phone and desktop sizes", async ({
  page,
  request,
}) => {
  test.setTimeout(240000);

  /* eslint-disable no-await-in-loop */
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    const health = await request.get(`${BASE_URL}/api/health`);

    expect(await health.text(), `${viewport.name} health`).toBe("degraded");

    for (const path of ROUTES) {
      const response = await page.goto(`${BASE_URL}${path}`);

      expect(response?.status(), `${viewport.name} ${path}`).toBe(200);
      await expect(
        page.getByRole("heading", { name: "This deployment is not set up yet" })
      ).toBeVisible();
      await expect(page.getByText("migrations", { exact: true })).toBeVisible();
      await expect(page.getByText("seed", { exact: true })).toBeVisible();
      await expect(page.getByText("realm", { exact: true })).toBeVisible();
      await expect(page.getByText("clients", { exact: true })).toBeVisible();
      await expect(page.getByRole("navigation")).toHaveCount(0);
      await expect(page.getByRole("button")).toHaveCount(0);
      await expect(page.getByRole("link")).toHaveCount(0);
    }

    const accessibility = await new AxeBuilder({ page }).analyze();

    expect(
      accessibility.violations,
      `${viewport.name} not-set-up page`
    ).toEqual([]);
  }
  /* eslint-enable no-await-in-loop */

  await completeKnownSteps();

  /* eslint-disable no-await-in-loop */
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    const health = await request.get(`${BASE_URL}/api/health`);

    expect(await health.text(), `${viewport.name} health after setup`).toBe(
      "ok"
    );

    for (const path of ROUTES) {
      const response = await page.goto(`${BASE_URL}${path}`);
      const body = await page.locator("body").innerText();

      expect(response?.status(), `${viewport.name} ${path} after setup`).toBe(
        200
      );
      expect(body, `${viewport.name} ${path} after setup`).not.toContain(
        "This deployment is not set up yet"
      );

      const expectedContent = new Map([
        ["/", "Genie Ops Center"],
        ["/placeholder", "You may not view this page."],
        ["/viewer/placeholder", "Placeholder viewer"],
      ]).get(path);

      expect(body, `${viewport.name} ${path} content`).toContain(
        expectedContent
      );
    }
  }
  /* eslint-enable no-await-in-loop */
});
