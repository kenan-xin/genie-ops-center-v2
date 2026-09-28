/**
 * The Sessions block's one read of a session row's `user_agent` (R-18): a device line and a
 * browser line, shown as strings and never as a place. This is a display classifier, not a
 * parser: it reads the model token and the platform between the first parentheses and the last
 * browser token, and answers a plain fallback rather than an empty cell when the row carried
 * nothing it recognizes.
 */
type AgentDescription = {
  readonly device: string;
  readonly browser: string;
};

const UNKNOWN: AgentDescription = {
  device: "Unknown device",
  browser: "Unknown browser",
};

/** The browser a token names, in the order a string that carries several is read. */
const BROWSER_BY_TOKEN: readonly (readonly [token: string, name: string])[] = [
  ["Edg/", "Edge"],
  ["OPR/", "Opera"],
  ["Firefox/", "Firefox"],
  ["Chrome/", "Chrome"],
  ["Version/", "Safari"],
];

/** The platform a system token names, in the order the parenthetical carries them. */
const PLATFORM_BY_TOKEN: readonly (readonly [token: string, name: string])[] = [
  ["Windows", "Windows"],
  ["Macintosh", "macOS"],
  ["Android", "Android"],
  ["iPhone", "iPhone"],
  ["iPad", "iPad"],
  ["Linux", "Linux"],
];

/** The device model inside the parenthetical, when the platform names a phone or tablet. */
function deviceModel(
  parenthetical: string,
  platform: string | undefined
): string | undefined {
  if (platform === undefined || platform === "iPhone" || platform === "iPad")
    return platform;

  if (platform !== "Android") return undefined;

  const parts = parenthetical
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  // The parenthetical reads `platform; os-version; model`, so the part after the version is
  // the model. A `Build/` fragment or a bare token is not it.
  const versionIndex = parts.findIndex((part) => part.startsWith("Android"));

  const candidate = parts
    .slice(versionIndex + 1)
    .map((part) => part.replace(/\s+Build\/.*$/, "").trim())
    .find((part) => part.length > 0);

  return candidate;
}

/**
 * The device and browser lines of one `user_agent` value. `null` answers the plain fallback,
 * so a session row that never carried an agent still renders two filled cells.
 */
export function describeUserAgent(userAgent: string | null): AgentDescription {
  if (userAgent === null) return UNKNOWN;

  const browser =
    BROWSER_BY_TOKEN.find(([token]) => userAgent.includes(token))?.[1] ??
    userAgent.match(/^([A-Za-z][\w-]*)\//)?.[1];

  const parenthetical = userAgent.match(/\(([^)]*)/)?.[1] ?? "";

  const platform = PLATFORM_BY_TOKEN.find(([token]) =>
    parenthetical.includes(token)
  )?.[1];

  const model = deviceModel(parenthetical, platform);

  const device =
    model !== undefined && platform !== undefined
      ? `${model} (${platform})`
      : (platform ?? UNKNOWN.device);

  return { device, browser: browser ?? UNKNOWN.browser };
}
