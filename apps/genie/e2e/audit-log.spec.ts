import { expect, test } from "@playwright/test";

/**
 * The browser proof for the Audit log route. Sign-in arrives with S2-04, so the browser is
 * anonymous and the real evaluator grants it nothing: the route stays mounted and refuses on the
 * server (R-35), and the list procedure refuses through the transport. The signed-in success path
 * at both viewports belongs to S2-16.
 */
test("the audit route refuses an anonymous request and reveals nothing", async ({
  page,
}) => {
  await page.goto("/admin/audit");

  await expect(page.getByTestId("permission-denied")).toBeVisible();
  // The refused page reveals nothing it would have rendered.
  await expect(page.getByRole("heading", { name: "Audit log" })).toHaveCount(0);
  await expect(page.getByText(/Who did what/)).toHaveCount(0);
});

test("the audit list procedure refuses an anonymous request through the real transport", async ({
  request,
  baseURL,
}) => {
  const response = await request.get(
    `${baseURL}/api/trpc/audit.list?input=${encodeURIComponent("{}")}`
  );

  expect(response.status()).toBe(403);

  // SAFETY: the body is the tRPC envelope this route wrote, and the assertion below reads the
  // one field this test checks.
  const body = (await response.json()) as {
    error?: { data?: { code?: string } };
  };

  expect(body.error?.data?.code).toBe("FORBIDDEN");
});
