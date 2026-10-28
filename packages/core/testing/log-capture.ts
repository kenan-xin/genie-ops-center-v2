import type { DestinationStream } from "pino";
import { expect } from "vitest";

import { createLogger } from "../src/services/logging/index.ts";

export function captureLoggerStream() {
  const chunks: string[] = [];

  const destination: DestinationStream = {
    write(chunk) {
      chunks.push(chunk);
    },
  };

  return {
    destination,
    output: () => chunks.join(""),
    clear() {
      chunks.length = 0;
    },
    proveCapture(logger: ReturnType<typeof createLogger>) {
      const previousLevel = logger.level;
      logger.level = "trace";

      try {
        logger.info(
          { captureControl: "integration-test" },
          "integration-capture-control"
        );
      } finally {
        logger.level = previousLevel;
      }

      expect(chunks.join("")).toContain("integration-capture-control");
    },
  };
}
