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

/**
 * The first `limit` cases of the extraction and answer tracks (every case without a limit). The
 * answers keep their session order, so a kept question keeps the earlier turns of its session. The
 * chart cases are those of the kept questions, because a chart comes from its answer's call.
 */
export function casesWithin(limit?: number) {
  const asked = new Set(ANSWER_CASES.flat().slice(0, limit));

  return {
    extraction: EXTRACTION_CASES.slice(0, limit),
    answers: ANSWER_CASES.map((session) =>
      session.filter((id) => asked.has(id))
    ).filter((session) => session.length > 0),
    charts: CHART_CASES.filter((item) => asked.has(item.questionId)),
  };
}
