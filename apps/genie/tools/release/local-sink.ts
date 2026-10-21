import { appendFileSync } from "node:fs";

/**
 * A safe local publish sink for tests and for exercising the release ordering
 * without a registry. It is the replacement for the authorized `docker push`
 * boundary, never a publication of its own: it records the exact identity the
 * smoke step verified beside the ref a real push would have used.
 *
 * Usage: `node tools/release/local-sink.ts <identity> <publishedRef>`
 */
const [identity, publishedRef] = process.argv.slice(2);

if (identity === undefined || publishedRef === undefined) {
  process.stderr.write(
    "the local sink needs the immutable identity and the published ref\n"
  );
  process.exit(2);
}

const record = process.env.GENIE_SINK_FILE;

if (record !== undefined) {
  appendFileSync(record, `${identity} ${publishedRef}\n`, "utf8");
}

process.stdout.write(`local sink received ${identity} for ${publishedRef}\n`);
