import { z } from "zod";

/**
 * The scheduled Entra run's one repository secret, `ENTRA_TEST_TENANT`: a JSON object that
 * describes the test tenant "Default Directory" (tech plan D2-2). The workflow passes it in the
 * environment; when it is absent the suite skips, never fails. The fields and the tenant setup
 * they need are documented in `docs/guides/sign-in/s-g-large-entra-jit.md`.
 */
const person = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const entraTenant = z.object({
  /** The directory (tenant) id; the issuer is `https://login.microsoftonline.com/<id>/v2.0`. */
  tenantId: z.string().uuid(),
  /** The app registration's application (client) id and one client secret value. */
  clientId: z.string().uuid(),
  clientSecret: z.string().min(1),
  /** The object id of the group assigned to the app; `assigned` is a direct member. */
  groupId: z.string().uuid(),
  /** The object id of a group that holds `groupId` as a nested member. */
  parentGroupId: z.string().uuid(),
  /** A person assigned to the app through `groupId`, with no MFA prompt. */
  assigned: person,
  /** A person in the tenant who is not assigned to the app. */
  unassigned: person,
  /** Optional: an assigned person in more than 200 groups, for the overage observation. */
  overage: person.optional(),
});

export type EntraTenant = z.infer<typeof entraTenant>;

/** The name of the environment variable the workflow fills from the repository secret. */
export const ENTRA_SECRET = "ENTRA_TEST_TENANT";

/** The parsed tenant, or undefined when the secret is absent. A malformed secret throws. */
export function entraTenantFromEnv(): EntraTenant | undefined {
  const raw = process.env[ENTRA_SECRET]?.trim();

  if (raw === undefined || raw === "") return undefined;

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    // A fixed message and no cause: the parser's own message quotes the start of the input.
    throw new Error(`${ENTRA_SECRET} is not valid JSON`);
  }

  const parsed = entraTenant.safeParse(value);

  if (!parsed.success) {
    // The issue paths only, never the values: the secret holds passwords.
    throw new Error(
      `${ENTRA_SECRET} is malformed at: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`
    );
  }

  return parsed.data;
}
