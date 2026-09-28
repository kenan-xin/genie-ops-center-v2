import { describe, expect, it } from "vitest";

import { describeUserAgent } from "./user-agent.ts";

/**
 * The Sessions block's device and browser lines (R-18): one classifier over the session row's
 * raw `user_agent`, never a place, and never an empty cell for a value the row did not carry.
 */
describe("describeUserAgent", () => {
  it("splits a browser on a phone into device and browser lines", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36"
      )
    ).toEqual({ device: "Pixel 7 (Android)", browser: "Chrome" });
  });

  it("names a desktop platform when the string carries no model", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
      )
    ).toEqual({ device: "macOS", browser: "Safari" });
  });

  it("prefers Edge over the Chrome token it also carries", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"
      )
    ).toEqual({ device: "Windows", browser: "Edge" });
  });

  it("reads Firefox", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
      )
    ).toEqual({ device: "Linux", browser: "Firefox" });
  });

  it("answers a plain fallback for an unknown or absent string", () => {
    expect(describeUserAgent(null)).toEqual({
      device: "Unknown device",
      browser: "Unknown browser",
    });
    expect(describeUserAgent("curl/8.5.0")).toEqual({
      device: "Unknown device",
      browser: "curl",
    });
  });
});
