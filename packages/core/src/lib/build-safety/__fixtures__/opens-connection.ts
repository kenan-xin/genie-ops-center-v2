/**
 * The connection control: a lazy pool construction followed by one query. The
 * connect fails against localhost port 1; only the attempt matters. The hostname
 * rather than an IP literal makes the query resolve through `dns.lookup`, so both
 * halves of the connection detector are proven to fire.
 */
import pg from "pg";

const pool = new pg.Pool({ connectionString: "postgres://u@localhost:1/x" });

try {
  await pool.query("select 1");
} catch {
  // The failure is expected; the detector records the attempt.
}
