import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import {
  generatePassword,
  meetsPasswordRule,
} from "../../lib/password/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import {
  account,
  session,
  twoFactor,
  user,
  verification,
} from "../../schema.ts";

/** Better Auth's own provider id for an email and password account (D2-5). */
const CREDENTIAL_PROVIDER_ID = "credential";

/** What `break-glass rotate` prints through: the command's own output. */
export type RotateBreakGlassOptions = {
  readonly output: (line: string) => void;
};

/**
 * R-60, DEC-24: one transaction rotates the break-glass password, clears the authenticator, sets
 * `must_change_password`, and deletes the account's sessions. The new password is printed once,
 * after the commit, for the operator's secret store; it is never written to a file, a log, an
 * audit row or the `setup_step` detail. The runner writes the one `ops:break-glass-rotate` row.
 *
 * A deployment with no break-glass account is refused by name: the operator runs setup first. An
 * account that exists is refused when its credential login is missing, because rotating could not
 * then deliver a usable secret.
 */
export async function rotateBreakGlass(
  context: TenantContext,
  options: RotateBreakGlassOptions
): Promise<void> {
  const rotated = await context.db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.isBreakGlass, true))
      .limit(1);

    if (owner === undefined) {
      throw new Error(
        "break-glass rotate: this deployment has no break-glass account (R-57, R-60)"
      );
    }

    const accounts = await tx
      .select({ id: account.id, providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, owner.id));

    const credentialAccount = accounts.find(
      ({ providerId }) => providerId === CREDENTIAL_PROVIDER_ID
    );

    if (credentialAccount === undefined) {
      throw new Error(
        `break-glass rotate: the account ${owner.email} has no credential login to rotate (R-60)`
      );
    }

    const generated = generatePassword();

    if (!meetsPasswordRule(generated, owner.email)) {
      throw new Error(
        "break-glass rotate: the generated password did not meet the R-64 rule"
      );
    }

    await tx
      .update(account)
      .set({ password: await hashPassword(generated) })
      .where(eq(account.id, credentialAccount.id));

    // R-60: the authenticator is cleared and the forced change is set, so the next sign-in runs
    // both limited-session steps again.
    await tx.delete(twoFactor).where(eq(twoFactor.userId, owner.id));
    await tx
      .update(user)
      .set({ mustChangePassword: true, twoFactorEnabled: false })
      .where(eq(user.id, owner.id));

    // ...and every session the account holds is deleted.
    await tx.delete(session).where(eq(session.userId, owner.id));

    // B1: any stored two-factor material tied to this account goes too. The plugin's challenge
    // and trust-device rows live in `verification` with `value` equal to the user id, so an old
    // trust-device cookie cannot skip the code step after the rotation.
    await tx.delete(verification).where(eq(verification.value, owner.id));

    return { email: owner.email, password: generated };
  });

  options.output(
    `break-glass rotate: account ${rotated.email} rotated; password: ${rotated.password}`
  );
}
