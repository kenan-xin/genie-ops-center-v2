import { AxeBuilder } from "@axe-core/playwright";
import { SETUP_STEPS } from "@genie/core";
import { expect, test, type Page } from "@playwright/test";

import { compose, HOST_PORT } from "./setup-gate/stack.ts";
import { expectSecurityHeaders } from "./support/headers.ts";

const BASE_URL = `http://127.0.0.1:${HOST_PORT}`;

const ROUTES = ["/", "/placeholder", "/viewer/placeholder"] as const;

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

async function psql(sql: string): Promise<void> {
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
    sql,
  ]);
}

async function completeKnownSteps(): Promise<void> {
  const steps = SETUP_STEPS.map((step) => `('${step}', 'done')`).join(", ");

  // The branding row omits default_theme, so the column default `system` applies.
  await psql(
    `insert into tenant_module (module_id, enabled) values ('placeholder', true) on conflict (module_id) do update set enabled = true; insert into setup_step (step, state) values ${steps} on conflict (step) do update set state = 'done', detail = null, updated_at = now(); insert into tenant_branding (company_name, product_name, default_locale, default_time_zone, primary_color, primary_foreground, font_size) values ('Setup Gate', 'Genie Ops Center', 'en', 'UTC', '#0f766e', '#ffffff', 'large') on conflict do nothing`
  );
}

/** What the document resolves on <html>. */
async function rootTokens(page: Page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);

    // The CSS minifier shortens #ffffff to #fff, so expand three-digit hex before comparing.
    const color = (name: string) =>
      root
        .getPropertyValue(name)
        .trim()
        .replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, "#$1$1$2$2$3$3");

    return {
      primary: color("--primary"),
      primaryForeground: color("--primary-foreground"),
      rootSize: root.fontSize,
      theme: document.documentElement.dataset.theme,
    };
  });
}

/** AC-1, R-10: the default face loads from this deployment, through --font-sans, preloaded once. */
async function expectSelfHostedDefaultFace(
  page: Page,
  label: string
): Promise<void> {
  const face = await page.evaluate(async () => {
    const loaded = await document.fonts.load('15px "Plus Jakarta Sans"');
    const defaultFamily = getComputedStyle(document.body).fontFamily;

    document.documentElement.style.setProperty("--font-sans", "monospace");
    const seamFamily = getComputedStyle(document.body).fontFamily;
    document.documentElement.style.removeProperty("--font-sans");

    const preloads = [
      ...document.querySelectorAll<HTMLLinkElement>(
        'link[rel="preload"][as="font"]'
      ),
    ].map((link) => link.href);

    // The latin face is the rule whose range starts at U+0000, however the browser spells it.
    const latinSources: string[] = [];

    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (!(rule instanceof CSSFontFaceRule)) continue;

        if (
          rule.style.getPropertyValue("font-family").replaceAll(/["']/g, "") !==
          "Plus Jakarta Sans"
        ) {
          continue;
        }

        if (
          !/U\+0+-0*FF(?![0-9A-F])/i.test(
            rule.style.getPropertyValue("unicode-range")
          )
        )
          continue;

        const url = /url\(\s*["']?([^"')]+)/.exec(
          rule.style.getPropertyValue("src")
        )?.[1];

        if (url !== undefined)
          latinSources.push(new URL(url, sheet.href ?? location.href).href);
      }
    }

    return {
      loaded: loaded.length,
      defaultFamily,
      seamFamily,
      preloads,
      latinSources,
    };
  });

  expect(face.loaded, `${label} face loads`).toBeGreaterThan(0);
  expect(face.defaultFamily, `${label} body face`).toMatch(
    /^"?Plus Jakarta Sans/
  );
  expect(face.seamFamily, `${label} --font-sans seam`).toBe("monospace");
  expect(face.preloads, `${label} one preload`).toHaveLength(1);
  expect(face.latinSources, `${label} preload is the latin face`).toEqual(
    face.preloads
  );
}

test("AC-2: three routes switch from not-set-up to normal at phone and desktop sizes", async ({
  page,
  request,
}) => {
  test.setTimeout(420000);

  // AC-1: every font and stylesheet request stays on this deployment. The viewer route frames
  // its module's own embed origin by design, so other request types are not counted.
  const requestHosts = new Set<string>();

  page.on("request", (pageRequest) => {
    if (!["font", "stylesheet"].includes(pageRequest.resourceType())) return;

    requestHosts.add(new URL(pageRequest.url()).host);
  });

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

      // R-71: the not-set-up page carries the Section 0 headers. The viewer route keeps its own
      // frame policy, which the header integration suite pins.
      if (path !== "/viewer/placeholder") {
        expectSecurityHeaders(response, `${viewport.name} ${path} not set up`);
      }

      // Every step the running image knows is listed (R-17b): all seven after Section 2.
      for (const step of SETUP_STEPS) {
        await expect(
          page.getByText(step, { exact: true }),
          `${viewport.name} ${path} lists ${step}`
        ).toBeVisible();
      }

      await expect(page.getByRole("navigation")).toHaveCount(0);
      await expect(page.getByRole("button")).toHaveCount(0);
      await expect(page.getByRole("link")).toHaveCount(0);
    }

    // R-12a: with no branding row the layout emits the packages/ui defaults and never calls the
    // reader, which throws on a missing row.
    expect(
      await rootTokens(page),
      `${viewport.name} not-set-up tokens`
    ).toMatchObject({
      primary: "#2563eb",
      primaryForeground: "#ffffff",
      rootSize: "15px",
    });
    await expectSelfHostedDefaultFace(page, `${viewport.name} not set up`);

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

      if (path === "/") {
        // R-12, R-14: the unlayered tenant style beats the layered default.
        expect(
          await rootTokens(page),
          `${viewport.name} tenant tokens`
        ).toMatchObject({
          primary: "#0f766e",
          rootSize: "16px",
        });
      }
    }
  }
  /* eslint-enable no-await-in-loop */

  // R-17: the organization theme is `system`, so the device decides before the body paints.
  await page.addInitScript(() => {
    new MutationObserver((_records, observer) => {
      if (document.body === null) return;

      document.documentElement.setAttribute(
        "data-theme-at-body",
        document.documentElement.dataset.theme ?? "none"
      );
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${BASE_URL}/`);
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-at-body",
    "dark"
  );
  await page.emulateMedia({ colorScheme: "light" });
  await expect
    .poll(async () => (await rootTokens(page)).theme, { timeout: 5000 })
    .toBe("light");

  // R-18: a stored change shows once the 10 s reader window has passed, and the organization's
  // theme wins over the device.
  await psql(
    "update tenant_branding set primary_color = '#6d28d9', primary_foreground = '#ffffff', default_theme = 'dark'"
  );
  await expect
    .poll(
      async () => {
        await page.reload();

        return (await rootTokens(page)).primary;
      },
      { timeout: 20_000, intervals: [1000] }
    )
    .toBe("#6d28d9");
  expect(
    (await rootTokens(page)).theme,
    "organization dark wins over a light device"
  ).toBe("dark");
  await expectNoViolations(page, "organization dark");

  // R-17: dark: follows the attribute, not the device.
  await psql("update tenant_branding set default_theme = 'light'");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(
      async () => {
        await page.reload();

        return (await rootTokens(page)).theme;
      },
      { timeout: 20_000, intervals: [1000] }
    )
    .toBe("light");
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    "light organization on a dark device"
  ).toBe("rgb(255, 255, 255)");
  await expectNoViolations(page, "organization light on a dark device");

  expect(
    [...requestHosts],
    "every font and stylesheet stays on this deployment"
  ).toEqual([`127.0.0.1:${HOST_PORT}`]);
});

/** axe at both viewports on the current document. */
async function expectNoViolations(page: Page, label: string): Promise<void> {
  /* eslint-disable no-await-in-loop */
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    const accessibility = await new AxeBuilder({ page }).analyze();

    expect(accessibility.violations, `${viewport.name} ${label}`).toEqual([]);
  }
  /* eslint-enable no-await-in-loop */
}
