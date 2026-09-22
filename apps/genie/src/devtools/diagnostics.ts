import { STUB_GRANTED_KEY } from "@genie/core";
import type { DeploymentDiagnosticsProps } from "@genie/ui";

import type { AppContext } from "../context.ts";
import { modules } from "../registry.ts";

/** What the panel shows when the connection string tells it nothing safe. */
const UNKNOWN = "unknown";

/** The schemes this deployment connects with (environment contract, DATABASE_URL). */
const DATABASE_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

/**
 * The database name, and nothing else, from a connection string.
 *
 * The URL carries the user, the password, the host and the port. None of those
 * belongs on a screen, so this returns the path segment alone. A string that
 * does not parse returns a fixed word rather than any part of the input, so a
 * malformed value cannot leak through the error path either.
 */
export function databaseName(connectionString: string): string {
  try {
    const url = new URL(connectionString);

    // Two guards, and both are load-bearing.
    //
    // The scheme, because `new URL` accepts an opaque string such as
    // `user:password@nowhere` and calls the password its path.
    //
    // The host, because a known scheme without an authority is opaque too:
    // `postgres:user:pw@host:5432/db`, one missing pair of slashes, parses with
    // protocol `postgres:` and puts the user, the password, the host and the
    // port in the path. Requiring a host is what makes that fall through to the
    // fixed word rather than being printed.
    if (!DATABASE_PROTOCOLS.has(url.protocol) || url.host === "") {
      return UNKNOWN;
    }

    return url.pathname.replace(/^\//, "") || UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

/**
 * What the Genie Ops Center panel shows, read from the one context.
 *
 * Section 0 authenticates nobody, so there is no user, no group and no role to
 * report. The permission list is the key the stub grant reader returns, which
 * is the only grant that exists until Section 2 supplies real roles.
 */
export function deploymentDiagnostics(
  context: AppContext
): DeploymentDiagnosticsProps {
  return {
    database: databaseName(context.tenant.env.databaseUrl),
    contextId: context.contextId,
    modules: modules.map((module) => module.identity.id),
    permissions: [STUB_GRANTED_KEY],
  };
}
