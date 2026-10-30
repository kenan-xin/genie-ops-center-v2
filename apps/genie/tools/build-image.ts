import { execFileSync } from "node:child_process";

import {
  COMPOSE_IMAGE,
  IMAGE,
  IMAGE_MODULE_INCLUDE,
  WORKSPACE_ROOT,
} from "../testing/image-tag.ts";

/**
 * Builds the app integration image, under the per-worktree tag the integration
 * suite uses and the fixed tag the compose stack and Playwright gates default
 * to.
 *
 * The two tags name the same bytes: the scoped tag is built first and the fixed
 * tag is a local `docker tag`, so the second is not a second build. Building the
 * scoped tag here rather than inside the test keeps `test:integration`'s
 * `build-image` dependency meaningful and the freshness guard a cache hit.
 *
 * The selection is `IMAGE_MODULE_INCLUDE`, so the specs that drive this image
 * read the same one.
 */

function docker(args: readonly string[]): void {
  execFileSync("docker", [...args], { cwd: WORKSPACE_ROOT, stdio: "inherit" });
}

docker([
  "build",
  "-f",
  "deploy/Dockerfile",
  "--build-arg",
  `MODULE_INCLUDE=${IMAGE_MODULE_INCLUDE}`,
  "-t",
  IMAGE,
  ".",
]);

docker(["tag", IMAGE, COMPOSE_IMAGE]);
