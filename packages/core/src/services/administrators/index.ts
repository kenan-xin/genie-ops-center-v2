import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { group, groupMember, user } from "../../schema.ts";
import { GENIE_ADMINISTRATORS_GROUP } from "../authorization/index.ts";
import { nameForEmail } from "../setup/identity-rows.ts";

/**
 * `genie-ops admin add <email>`: pre-add the person as a pending member of the local
 * `Genie Administrators` group, or add an existing person to it (Spec 2 R-59, `DEC-23`). It sends
 * no email, so the recovery path runs without a mailer, and it writes only the application
 * database, so it is never an identity command and never runs the Keycloak address guard.
 *
 * The write is one transaction and idempotent: an existing person keeps their row, and a second
 * run changes no membership. The person is lower-cased, matching the `user.email` invariant the
 * whole identity layer keeps.
 */
export async function addAdministrator(
  context: TenantContext,
  email: string,
  options: { readonly output: (line: string) => void }
): Promise<void> {
  const address = email.trim().toLowerCase();

  if (address === "" || !address.includes("@")) {
    throw new Error("admin add needs an email address");
  }

  let created = false;

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
        `admin add found no ${GENIE_ADMINISTRATORS_GROUP} group; run genie-ops setup first`
      );
    }

    const [existing] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, address))
      .limit(1);

    let userId = existing?.id;

    if (userId === undefined) {
      const [added] = await tx
        .insert(user)
        .values({
          id: randomUUID(),
          name: nameForEmail(address),
          email: address,
          status: "pending",
          onboarding: "invited",
        })
        .returning({ id: user.id });

      userId = added?.id;
      created = true;
    }

    if (userId === undefined) {
      throw new Error(`admin add could not add ${address}`);
    }

    await tx
      .insert(groupMember)
      .values({ groupId: administrators.id, userId, source: "local" })
      .onConflictDoNothing();
  });

  options.output(
    `admin add: ${address} ${created ? "pre-added as pending and added" : "added"} to ${GENIE_ADMINISTRATORS_GROUP}`
  );
}
