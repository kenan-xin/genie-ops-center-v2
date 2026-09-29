import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";

/**
 * One disposable Keycloak 26.7.4 container for the realm and clients step tests, started in
 * development mode with a bootstrap administrator. The bootstrap username and password are the
 * constants the tests pass to `genie-ops setup`, so a test never writes a credential anywhere it
 * did not already exist.
 */
export const KEYCLOAK_BOOTSTRAP_USER = "admin";

/** A distinct password, so a test can assert it never reaches the output or a `setup_step` cause. */
export const KEYCLOAK_BOOTSTRAP_PASSWORD = "kc-bootstrap-password-do-not-log";

export const KEYCLOAK_IMAGE = "quay.io/keycloak/keycloak:26.7.4";

export type DisposableKeycloak = {
  readonly baseUrl: string;
  readonly stop: () => Promise<void>;
};

export async function startDisposableKeycloak(): Promise<DisposableKeycloak> {
  const container: StartedTestContainer = await new GenericContainer(
    KEYCLOAK_IMAGE
  )
    .withCommand(["start-dev", "--http-port=8080"])
    .withEnvironment({
      KC_BOOTSTRAP_ADMIN_USERNAME: KEYCLOAK_BOOTSTRAP_USER,
      KC_BOOTSTRAP_ADMIN_PASSWORD: KEYCLOAK_BOOTSTRAP_PASSWORD,
      KC_HEALTH_ENABLED: "true",
    })
    .withExposedPorts(8080)
    .withWaitStrategy(
      Wait.forHttp("/realms/master/.well-known/openid-configuration", 8080)
    )
    // Keycloak start-dev takes over a minute on a 2-core CI runner, past the 60 s default.
    // It stays under the 180 s beforeAll limit of the realm-step suite.
    .withStartupTimeout(170000)
    .start();

  return {
    baseUrl: `http://${container.getHost()}:${container.getMappedPort(8080)}`,
    stop: async () => {
      await container.stop();
    },
  };
}
