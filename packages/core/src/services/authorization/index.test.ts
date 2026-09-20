import { describe, expect, it } from "vitest";

import { can, scopesFor } from "./index.ts";
import { createRequestPrincipal } from "./principal.ts";
import { STUB_GRANTED_KEY, createStubGrantReader } from "./stub.ts";

function countingReader() {
  const reader = createStubGrantReader();
  let reads = 0;

  return {
    reads: () => reads,
    read: async () => {
      reads += 1;

      return reader();
    },
  };
}

function principalWith(
  read: () => Promise<
    Awaited<ReturnType<ReturnType<typeof createStubGrantReader>>>
  >
) {
  return createRequestPrincipal({ userId: "u1", groups: [] }, read);
}

describe("the Section 0 authorization stub", () => {
  it("grants placeholder:read", async () => {
    const user = principalWith(createStubGrantReader());

    await expect(can(user, STUB_GRANTED_KEY)).resolves.toBe(true);
  });

  it("refuses every other key", async () => {
    const user = principalWith(createStubGrantReader());

    await expect(can(user, "placeholder:admin")).resolves.toBe(false);
    await expect(can(user, "placeholder:use")).resolves.toBe(false);
    await expect(can(user, "invoices:approve")).resolves.toBe(false);
  });

  it("refuses a resource check for a key it does not grant", async () => {
    const user = principalWith(createStubGrantReader());

    await expect(
      can(user, "placeholder:admin", { type: "placeholder-record", id: "r1" })
    ).resolves.toBe(false);
  });

  it("answers scopesFor with none for a refused key", async () => {
    const user = principalWith(createStubGrantReader());

    await expect(scopesFor(user, "invoices:approve")).resolves.toEqual({
      kind: "none",
    });
  });

  it("answers scopesFor with all for the granted key", async () => {
    const user = principalWith(createStubGrantReader());

    await expect(scopesFor(user, STUB_GRANTED_KEY)).resolves.toEqual({
      kind: "all",
    });
  });
});

describe("the lazy loader", () => {
  it("reads once however many calls one execution makes", async () => {
    const counting = countingReader();
    const user = principalWith(counting.read);

    expect(counting.reads()).toBe(0);

    await can(user, STUB_GRANTED_KEY);
    await can(user, "placeholder:admin");
    await scopesFor(user, STUB_GRANTED_KEY);
    await can(user, STUB_GRANTED_KEY);

    expect(counting.reads()).toBe(1);
  });

  it("reads once even when calls start before the first read settles", async () => {
    const counting = countingReader();
    const user = principalWith(counting.read);

    await Promise.all([
      can(user, STUB_GRANTED_KEY),
      can(user, STUB_GRANTED_KEY),
      scopesFor(user, STUB_GRANTED_KEY),
    ]);

    expect(counting.reads()).toBe(1);
  });

  it("memoises a rejected read for the principal's lifetime", async () => {
    let reads = 0;
    const user = principalWith(async () => {
      reads += 1;

      throw new Error("loader down");
    });

    await expect(can(user, STUB_GRANTED_KEY)).rejects.toThrow("loader down");
    await expect(can(user, STUB_GRANTED_KEY)).rejects.toThrow("loader down");

    expect(reads).toBe(1);
  });

  it("keeps two executions apart", async () => {
    const first = countingReader();
    const second = countingReader();

    await can(principalWith(first.read), STUB_GRANTED_KEY);
    await can(principalWith(second.read), STUB_GRANTED_KEY);

    expect(first.reads()).toBe(1);
    expect(second.reads()).toBe(1);
  });

  it("does not read until a permission is asked for", () => {
    const counting = countingReader();

    principalWith(counting.read);

    expect(counting.reads()).toBe(0);
  });
});
