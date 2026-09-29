import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";

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
 * secret. An account already flagged `is_break_glass` keeps its flags untouched; only its
 * credential is managed.
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

    // The account already completed its forced password change, so the secret it holds was
    // delivered and used. Its flags and credential stay as they are and nothing is printed.
    if (existing !== undefined && existing.mustChangePassword !== true) {
      return undefined;
    }

    const id = existing?.id ?? randomUUID();

    if (existing === undefined) {
      await tx.insert(user).values({
        id,
        name: nameForEmail(email),
        email,
        emailVerified: true,
        status: "active",
        isBreakGlass: true,
        mustChangePassword: true,
      });
    }

    const generated = generatePassword();

    if (!meetsPasswordRule(generated, email)) {
      throw new Error(
        "the generated break-glass password did not meet the R-64 rule"
      );
    }

    const passwordHash = await hashPassword(generated);

    const [credential] = await tx
      .select({ id: account.id })
      .from(account)
      .where(
        and(
          eq(account.userId, id),
          eq(account.providerId, CREDENTIAL_PROVIDER_ID)
        )
      )
      .limit(1);

    if (credential === undefined) {
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: id,
        providerId: CREDENTIAL_PROVIDER_ID,
        userId: id,
        password: passwordHash,
      });
    } else {
      await tx
        .update(account)
        .set({ password: passwordHash, updatedAt: sql`now()` })
        .where(eq(account.id, credential.id));
    }

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
