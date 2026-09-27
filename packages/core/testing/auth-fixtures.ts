import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { account, role, roleAssignment, user } from "../src/schema.ts";

/**
 * A person and the credential account that lets them sign in with email and password, the way the
 * `break_glass` step writes them (R-57). Real rows for the real instance: nothing fakes a session.
 *
 * The default values describe the break-glass account; a test that needs an ordinary person passes
 * `isBreakGlass: false`. When `permissions` is given, a role holding them is created and assigned
 * to the person directly, so the signed-in read runs through the real evaluator.
 */
export async function insertCredentialPerson(
  context: Pick<TenantContext, "db">,
  input: {
    readonly email: string;
    readonly password: string;
    readonly name?: string;
    readonly isBreakGlass?: boolean;
    readonly status?: string;
    readonly permissions?: readonly string[];
  }
): Promise<string> {
  const id = randomUUID();

  await context.db.insert(user).values({
    id,
    name: input.name ?? "Break Glass",
    email: input.email.toLowerCase(),
    emailVerified: true,
    isBreakGlass: input.isBreakGlass ?? true,
    status: input.status ?? "active",
  });

  await context.db.insert(account).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(input.password),
  });

  if (input.permissions !== undefined && input.permissions.length > 0) {
    const [createdRole] = await context.db
      .insert(role)
      .values({
        name: `credential-role-${id}`,
        permissions: [...input.permissions],
      })
      .returning({ id: role.id });

    if (createdRole === undefined) {
      throw new Error("The credential role insert returned no row.");
    }

    await context.db.insert(roleAssignment).values({
      roleId: createdRole.id,
      principalType: "user",
      principalId: id,
    });
  }

  return id;
}
