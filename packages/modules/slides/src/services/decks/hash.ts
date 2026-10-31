import { is, SQL, sql } from "drizzle-orm";

import type { DeckContent } from "../../content.ts";

/**
 * The content hash of D2: the hex sha256 of the jsonb text of `{ title, content }`. The jsonb
 * text form orders object keys, so one content hashes the same whatever order its keys were
 * written in, and the browser only echoes the hash it read. A plain content goes in as JSON
 * text; an SQL value (a column, or a new value in the same statement) goes in as it is.
 */
export function deckHashSql(
  title: string | SQL,
  content: DeckContent | SQL
): SQL {
  const json = is(content, SQL) ? content : JSON.stringify(content);

  return sql`encode(sha256(convert_to(jsonb_build_object('title', ${title}::text, 'content', ${json}::jsonb)::text, 'UTF8')), 'hex')`;
}
