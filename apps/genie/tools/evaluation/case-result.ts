/** One scored case of one run of one model. */
export type CaseResult = {
  readonly track: "extraction" | "answers" | "charts";
  readonly caseId: string;
  readonly model: string;
  readonly run: number;
  readonly pass: boolean;
  readonly reason?: string | undefined;
  readonly ms: number;
  readonly costUsd: number | null;
};
