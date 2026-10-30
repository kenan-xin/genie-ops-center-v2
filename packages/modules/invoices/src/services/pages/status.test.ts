import { describe, expect, it } from "vitest";

import { paymentStatusOf } from "./status.ts";

describe("paymentStatusOf", () => {
  it.each([
    { unallocatedCents: 500_000, status: "unallocated" },
    { unallocatedCents: 200_000, status: "part-allocated" },
    { unallocatedCents: 0, status: "allocated" },
  ])(
    "a payment of 500,000 with $unallocatedCents unallocated is $status",
    ({ unallocatedCents, status }) => {
      expect(paymentStatusOf({ amountCents: 500_000, unallocatedCents })).toBe(
        status
      );
    }
  );
});
