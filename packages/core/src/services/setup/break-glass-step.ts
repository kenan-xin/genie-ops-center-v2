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
 * in one transaction. The password is printed once, after the transaction commits, to the command
 * output for the operator's secret store; it is never written to a file, a log field, an audit row
 * or the `setup_step` detail.
 *
 * The step is resumable and idempotent. An account that already holds a credential is left alone,
 * so a rerun never rotates the password, and a person that already exists is updated in place
 * rather than duplicated. R-62 governs the refusal: flagging a person `is_break_glass` who already
 * has a non-credential (identity-provider) account would let that account bypass authorization, so
 * the step refuses by name.
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
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existing !== undefined) {
      const accounts = await tx
        .select({ providerId: account.providerId })
        .from(account)
        .where(eq(account.userId, existing.id));

      if (
        accounts.some(({ providerId }) => providerId !== CREDENTIAL_PROVIDER_ID)
      ) {
        throw new Error(
          `the break_glass step refuses to mark ${email} break-glass: the person already has an identity-provider account, which would otherwise inherit the break-glass bypass (R-62)`
        );
      }

      await tx
        .update(user)
        .set({
          isBreakGlass: true,
          mustChangePassword: true,
          updatedAt: sql`now()`,
        })
        .where(eq(user.id, existing.id));

      // A credential the person already holds is never replaced: a rerun keeps the printed
      // password valid and prints nothing.
      if (accounts.length > 0) return undefined;

      const generated = generatePassword();

      if (!meetsPasswordRule(generated, email)) {
        throw new Error(
          "the generated break-glass password did not meet the R-64 rule"
        );
      }

      await tx.insert(account).values({
        id: randomUUID(),
        accountId: existing.id,
        providerId: CREDENTIAL_PROVIDER_ID,
        userId: existing.id,
        password: await hashPassword(generated),
      });

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
      `break_glass step: account ${email} already has a credential; password left unchanged`
    );

    return;
  }

  options.output(
    `break_glass step: account ${email} created; password: ${password}`
  );
}
