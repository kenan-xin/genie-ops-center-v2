/** The tools core gives the boss agent itself; a module tool never takes one of these names (R-43). */
export const CORE_AGENT_TOOL_NAMES = [
  "list-datasets",
  "query-dataset",
  "open-record",
] as const;

/**
 * A tool name: lower-case kebab-case. Model providers accept only `^[a-zA-Z0-9_-]{1,64}$` and
 * refuse the whole request for one bad name, so a module tool also stays within 64 characters.
 */
export const AGENT_TOOL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const AGENT_TOOL_NAME_MAX = 64;
