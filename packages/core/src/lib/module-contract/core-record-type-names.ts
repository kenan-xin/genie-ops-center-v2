/**
 * The names of the record types core owns (`services/authorization/core-record-types.ts`). They live
 * apart from the resolvers, so the module contract's validator can reserve them without importing
 * the database schema.
 */
export const CORE_RECORD_TYPE_NAMES = {
  user: "user",
  group: "group",
  role: "role",
} as const;
