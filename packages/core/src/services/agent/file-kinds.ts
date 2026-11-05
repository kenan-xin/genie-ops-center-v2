/**
 * The file kinds that a chat makes from a list (R-44a). Core owns them, and a module adds none. This
 * file imports nothing, so a browser module can read it.
 */
export const FILE_FORMATS = ["csv", "xlsx", "md", "pdf"] as const;

export type FileFormat = (typeof FILE_FORMATS)[number];
