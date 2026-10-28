import { describe, expect, it } from "vitest";

import { eventCategory } from "./helpers.ts";

describe("the event category of an action key", () => {
  it("answers the domain the action belongs to, and none for an operator row", () => {
    const cases = [
      ["auth:break_glass_sign_in", "session"],
      ["core:person_removed", "people"],
      ["core:invitation_sent", "people"],
      ["core:set_password_sent", "people"],
      ["core:directory_group_added", "groups"],
      ["core:group_members_removed", "groups"],
      ["core:role_created", "access"],
      ["core:permission_transformation", "access"],
      ["core:branding_published", "settings"],
      ["core:settings_updated", "settings"],
      ["core:module_configured", "modules"],
      ["core:category_reordered", "modules"],
      ["solutions:status:changed", "module-event"],
      ["ops:migrate", null],
    ] as const;

    for (const [action, category] of cases) {
      expect(eventCategory(action), action).toBe(category);
    }
  });
});
