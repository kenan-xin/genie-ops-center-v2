import { LIVE_UPLOADS } from "@genie/module-invoices/testing";

import { CHART_CASES, SESSIONS } from "../../testing/invoice-answer-readers.ts";

/** The extraction track (R-58): the seven live uploads, by the number that starts each file name. */
export const EXTRACTION_CASES: readonly {
  readonly id: string;
  readonly file: string;
}[] = LIVE_UPLOADS.map((file) => ({
  id: file.slice(0, 2),
  file: `03_Live_Upload_Documents/${file}`,
}));

/** The answer track: the nine read questions, in the sessions the pack asks them. */
export const ANSWER_CASES = SESSIONS;

export { CHART_CASES };
