import { describe, expect, it } from "vitest";

import { databaseName } from "./diagnostics.ts";

/** A connection string with every secret a real one carries. */
const WITH_CREDENTIALS =
  "postgres://genie_user:s3cr3t-p4ssw0rd@db.internal.example.com:5432/genie_ops";

describe("databaseName", () => {
  it("returns the database name", () => {
    expect(databaseName(WITH_CREDENTIALS)).toBe("genie_ops");
  });

  // The panel renders this value, so the leak is the risk, not the formatting.
  it("returns no part of the user, password, host or port", () => {
    const shown = databaseName(WITH_CREDENTIALS);

    for (const secret of [
      "genie_user",
      "s3cr3t-p4ssw0rd",
      "db.internal.example.com",
      "5432",
    ]) {
      expect(shown).not.toContain(secret);
    }
  });

  // `new URL` accepts this: the scheme is `user:` and the "path" is the
  // password. Printing a parsed path without checking the scheme leaks it.
  it("returns a fixed word for an opaque url, not its contents", () => {
    expect(databaseName("user:password@nowhere")).toBe("unknown");
  });

  it("returns a fixed word for a string that is not a url at all", () => {
    expect(databaseName("not a url")).toBe("unknown");
  });

  it("returns a fixed word when the url carries no database", () => {
    expect(databaseName("postgres://user:pw@host:5432/")).toBe("unknown");
  });
});
