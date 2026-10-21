import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";

import {
  generatePassword,
  meetsPasswordRule,
} from "../../lib/password/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { account, user } from "../../schema.ts";
import { type SetupConfigFiles, loadTenantYaml } from "./config.ts";
import { nameForEmail } from "./identity-rows.ts";

/** Better Auth's own provider id for an email and password account (D2-5). */
const CREDENTIAL_PROVIDER_ID = "credential";

/** What the `break_glass` step prints its one-time password through. */
export type BreakGlassStepOptions = {
  readonly output: (line: string) => void;
};

/**
 * R-57, DEC-24: the operator-provisioned account that signs in at `/admin/login` with a generated
 * password. The step creates the `user` row with `is_break_glass` and `must_change_password`, and
 * its `credential` account row with the password hashed by the Better Auth password hasher (D2-5),
 * in one transaction. The hash is committed first, then the plaintext is printed once to the
 * command output for the operator's secret store; it is never written to a file, a log field, an
 * audit row or the `setup_step` detail. `runSetup` records the step `done` only after this function
 * returns, so a crash in the gap between the commit and the recorded step leaves the step not done.
 *
 * R-62 and R-57 govern what may be reused. A person that already exists but is not already the
 * break-glass principal is refused by name, whatever accounts they hold: turning an ordinary
 * credential into the emergency principal would hand out the bypass without ever delivering a new
 * secret. A row already flagged `is_break_glass` must be exactly the R-57 shape before it is
 * reused: it is refused when any account it holds is not the `credential` one, because the account
 * hook refuses only *new* provider links and could not repair an existing keycloak link that would
 * inherit the bypass, and it is refused when it holds no `credential` account at all, because the
 * step must not record done for an account that cannot sign in. Its flags are otherwise left
 * untouched.
 *
 * The delivery protocol is explicit, because a one-time secret that is committed but never printed
 * is a lost credential. A run reaches this step only while its `setup_step` row is not `done`, and
 * the setup gate serves no route before every step is done, so nobody can have signed in through
 * this account yet. A `must_change_password` of true therefore means the plaintext was never
 * delivered: the step generates a fresh password, replaces the stored hash and prints it. Once the
 * forced change has happened (`must_change_password` false) the stored password is left alone and
 * nothing is printed, and once the step is `done` the runner never calls this function again.
 */
export async function breakGlassStep(
  context: TenantContext,
  files: SetupConfigFiles,
  options: BreakGlassStepOptions
): Promise<void> {
  const tenant = await loadTenantYaml(files.tenantConfig);
  const email = tenant.break_glass_email.toLowerCase();

  const password = await context.db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: user.id,
        isBreakGlass: user.isBreakGlass,
        mustChangePassword: user.mustChangePassword,
      })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existing !== undefined && existing.isBreakGlass !== true) {
      throw new Error(
        `the break_glass step refuses to mark ${email} break-glass: the address already belongs to an ordinary person (R-57, R-62)`
      );
    }

    if (existing !== undefined) {
      const accounts = await tx
        .select({ id: account.id, providerId: account.providerId })
        .from(account)
        .where(eq(account.userId, existing.id));

      if (
        accounts.some(({ providerId }) => providerId !== CREDENTIAL_PROVIDER_ID)
      ) {
        throw new Error(
          `the break_glass step refuses ${email}: the break-glass account already has an identity-provider login, which would otherwise inherit the bypass (R-62)`
        );
      }

      const credential = accounts.find(
        ({ providerId }) => providerId === CREDENTIAL_PROVIDER_ID
      );

      if (credential === undefined) {
        throw new Error(
          `the break_glass step refuses ${email}: the break-glass account has no credential login (R-57)`
        );
      }

      // The account already completed its forced password change, so the secret it holds was
      // delivered and used. Its flags and credential stay as they are and nothing is printed.
      if (existing.mustChangePassword !== true) return undefined;

      const generated = generatePassword();

      if (!meetsPasswordRule(generated, email)) {
        throw new Error(
          "the generated break-glass password did not meet the R-64 rule"
        );
      }

      await tx
        .update(account)
        .set({ password: await hashPassword(generated), updatedAt: sql`now()` })
        .where(eq(account.id, credential.id));

      return generated;
    }

    const id = randomUUID();

    await tx.insert(user).values({
      id,
      name: nameForEmail(email),
      email,
      emailVerified: true,
      status: "active",
      isBreakGlass: true,
      mustChangePassword: true,
    });

    const generated = generatePassword();

    if (!meetsPasswordRule(generated, email)) {
      throw new Error(
        "the generated break-glass password did not meet the R-64 rule"
      );
    }

    await tx.insert(account).values({
      id: randomUUID(),
      accountId: id,
      providerId: CREDENTIAL_PROVIDER_ID,
      userId: id,
      password: await hashPassword(generated),
    });

    return generated;
  });

  if (password === undefined) {
    options.output(
      `break_glass step: account ${email} already provisioned; nothing to deliver`
    );

    return;
  }

  options.output(
    `break_glass step: account ${email} provisioned; password: ${password}`
  );
}
