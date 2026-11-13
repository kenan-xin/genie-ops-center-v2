import { TEST_FILE_LINK_SECRET } from "@genie/core/testing";

/**
 * The Section 2 authentication values a disposable test deployment starts with. `KEYCLOAK_URL`
 * points at a closed port, so discovery never answers: the app builds its instance, answers
 * `degraded` on health, and refuses sign-in, which is exactly the state a test that is not about
 * sign-in wants. A test that proves sign-in supplies its own reachable realm address instead.
 */
export const TEST_AUTH_ENV = {
  BETTER_AUTH_SECRET: "test-better-auth-secret-at-least-32-characters",
  KEYCLOAK_URL: "http://127.0.0.1:1",
  KEYCLOAK_REALM: "genie",
  KEYCLOAK_CLIENT_ID: "genie-ops-center",
  KEYCLOAK_CLIENT_SECRET: "test-client-secret",
  // The application profile requires the shared link key too (DEC-58); the same value as the
  // core test deployments, so a link one signs opens in the other.
  FILE_LINK_SECRET: TEST_FILE_LINK_SECRET,
};
