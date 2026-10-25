import { expect, type Browser } from "@playwright/test";

import { e2eBrandingAdminEmail } from "../../testing/e2e-keycloak.ts";
import { publishBranding } from "./branding-page.ts";
import { queryDatabase } from "./database.ts";
import { signInThroughKeycloak } from "./sign-in.ts";

/** A 1×1 opaque PNG. */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c63e02fcbfb0f00037e01f3a9df61700000000049454e44ae426082",
  "hex"
);

/**
 * Publishes a branding square mark the way an administrator does (DR-15): the project's branding
 * administrator uploads it on the Branding page, which stores it through the file service, and
 * publishes. No scanner exists, so the file is `skipped`. The caller holds the `branding`
 * deployment lock.
 */
export async function seedBrandingMark(
  browser: Browser,
  project: string
): Promise<void> {
  const context = await browser.newContext();

  try {
    const page = await context.newPage();

    await signInThroughKeycloak(page, {
      email: e2eBrandingAdminEmail(project),
    });
    await page.goto("/admin/branding");
    await page
      .getByLabel("Upload a file for Square mark")
      .setInputFiles({ name: "mark.png", mimeType: "image/png", buffer: PNG });
    await expect(
      page
        .getByRole("group", { name: "Square mark" })
        .getByText("mark.png", { exact: true })
    ).toBeVisible();
    await publishBranding(page);
  } finally {
    await context.close();
  }
}

/** Nulls the mark column. The file row stays, as after Remove and Publish on the Branding page. */
export async function clearBrandingMark(): Promise<void> {
  await queryDatabase("update tenant_branding set logo_mark_file_id = null");
}
