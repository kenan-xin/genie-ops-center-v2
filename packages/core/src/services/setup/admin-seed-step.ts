import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { group, groupMember, user } from "../../schema.ts";
import { GENIE_ADMINISTRATORS_GROUP } from "../authorization/index.ts";
import { type SetupConfigFiles, loadTenantYaml } from "./config.ts";
import { nameForEmail } from "./identity-rows.ts";

/**
 * The `admin_seed` step (R-56): every initial administrator from `tenant.yaml` is pre-added as a
 * pending person with `onboarding` `invited` and a local membership of `Genie Administrators`. It
 * sends no email, so setup runs without a mailer (DEC-23).
 *
 * Looking the person up by their lower-cased address makes it resumable and idempotent: a person
 * that already exists is left exactly as they are (an administrator who has signed in is already
 * active), and the membership is a create-if-missing. The `roles` step runs before this one, so
 * the group it belongs to exists.
 */
export async function adminSeedStep(
  context: TenantContext,
  files: SetupConfigFiles
): Promise<void> {
  const tenant = await loadTenantYaml(files.tenantConfig);

  await context.db.transaction(async (tx) => {
    const [administrators] = await tx
      .select({ id: group.id })
      .from(group)
      .where(
        and(
          eq(group.source, "local"),
          eq(group.name, GENIE_ADMINISTRATORS_GROUP)
        )
      )
      .limit(1);

    if (administrators === undefined) {
      throw new Error(
        `the admin_seed step found no ${GENIE_ADMINISTRATORS_GROUP} group; it runs after the roles step`
      );
    }

    for (const address of tenant.first_administrators) {
      const email = address.toLowerCase();

      // One administrator at a time: each row is a create-if-missing that the next does not read.
      // oxlint-disable-next-line no-await-in-loop
      const [existing] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);

      let userId = existing?.id;

      if (userId === undefined) {
        // oxlint-disable-next-line no-await-in-loop
        const [created] = await tx
          .insert(user)
          .values({
            id: randomUUID(),
            name: nameForEmail(email),
            email,
            status: "pending",
            onboarding: "invited",
          })
          .returning({ id: user.id });

        userId = created?.id;
      }

      if (userId === undefined) {
        throw new Error(`the admin_seed step could not pre-add ${email}`);
      }

      // oxlint-disable-next-line no-await-in-loop
      await tx
        .insert(groupMember)
        .values({ groupId: administrators.id, userId, source: "local" })
        .onConflictDoNothing();
    }
  });
}
