import { spawnSync } from "node:child_process";

/**
 * The first step of `nx run @genie/app:dev`: it stops the start with one clear line when the
 * Docker daemon does not answer, before `docker compose` starts the development database (xok3.92).
 */
const run = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
  stdio: "ignore",
  timeout: 15000,
});

if (run.status !== 0) {
  console.error(
    "Docker is not running. Start Docker, then run the dev target again."
  );
  process.exit(1);
}
