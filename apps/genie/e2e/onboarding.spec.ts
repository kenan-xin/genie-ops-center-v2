import { expect, test } from "@playwright/test";

import {
  E2E_SIGN_IN_REALM,
  e2eOnboardingEmail,
  setRealmUserGroups,
} from "../testing/e2e-keycloak.ts";
import { queryDatabase } from "./support/database.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

test("jit admits a realm person through a mapped directory group", async ({
  page,
}, testInfo) => {
  const email = e2eOnboardingEmail("admitted", testInfo.project.name);

  await signInThroughKeycloak(page, { email });

  const [person] = await queryDatabase(
    `select status || ':' || onboarding from "user" where email = '${email}'`
  );

  const [membership] = await queryDatabase(
    `select count(*) from group_member gm join "user" u on u.id = gm.user_id where u.email = '${email}' and gm.source = 'idp'`
  );

  expect(person).toBe("active:jit");
  expect(membership).toBe("1");
});

test("jit refuses a person without a mapped group before creating an account", async ({
  page,
}, testInfo) => {
  const email = e2eOnboardingEmail("refused", testInfo.project.name);

  await signInThroughKeycloak(page, { email, landing: "/sign-in" });

  expect(new URL(page.url()).searchParams.get("error")).toBe("not_registered");
  await expect(page.getByTestId("sign-in-banner")).toBeVisible();
  expect(
    await queryDatabase(`select id from "user" where email = '${email}'`)
  ).toEqual([]);
  expect(
    await queryDatabase(
      `select id from account where user_id in (select id from "user" where email = '${email}')`
    )
  ).toEqual([]);
  expect(
    await queryDatabase(
      `select count(*) from audit_event where action = 'auth:sign_in_refused' and metadata->>'email' = '${email}'`
    )
  ).toEqual(["1"]);
});

test("removing all realm groups removes all idp memberships on next sign-in", async ({
  page,
}, testInfo) => {
  const email = e2eOnboardingEmail("offboarded", testInfo.project.name);

  expect(
    await queryDatabase(
      `select count(*) from group_member gm join "user" u on u.id = gm.user_id where u.email = '${email}' and gm.source = 'idp'`
    )
  ).toEqual(["1"]);

  await setRealmUserGroups(E2E_SIGN_IN_REALM, email, []);
  await signInThroughKeycloak(page, { email });

  expect(
    await queryDatabase(
      `select count(*) from group_member gm join "user" u on u.id = gm.user_id where u.email = '${email}' and gm.source = 'idp'`
    )
  ).toEqual(["0"]);
});
