import { describe, expect, it } from "vitest";

import {
  AUDIT_ACTIONS,
  auditActionGroup,
  isOperatorAction,
} from "./actions.ts";

describe("the audit action catalogue", () => {
  it("groups an action by the prefix before the first colon", () => {
    expect(auditActionGroup("auth:sign_in")).toBe("auth");
    expect(auditActionGroup("core:person_added")).toBe("core");
    expect(auditActionGroup("solutions:status:changed")).toBe("solutions");
  });

  it("falls back to the whole key when there is no colon", () => {
    expect(auditActionGroup("standalone")).toBe("standalone");
  });

  it("recognises an operator action and not a bare prefix", () => {
    expect(isOperatorAction("ops:migrate")).toBe(true);
    expect(isOperatorAction("ops:")).toBe(false);
    expect(isOperatorAction("core:person_added")).toBe(false);
  });

  it("holds the sign-in, administration and transformation actions of R-45", () => {
    expect(AUDIT_ACTIONS).toContain("auth:sign_in_refused");
    expect(AUDIT_ACTIONS).toContain("core:group_label_changed");
    expect(AUDIT_ACTIONS).toContain("core:permission_transformation");
  });
});
