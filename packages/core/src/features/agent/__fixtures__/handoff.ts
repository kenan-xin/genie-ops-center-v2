import type { BriefPartData } from "../../../services/agent/brief.ts";
import type { HandoffCardData } from "../../../services/agent/hand-over.ts";
import type {
  AgentMessage,
  ChatLabels,
} from "../../../services/agent/index.ts";
import type { AgentRunStatus } from "../../../services/agent/runs.ts";
import type { AgentSessionDetail } from "../../../services/agent/store.ts";

/** One handoff as the stories show it: the card part, its brief and its session's reads. */
export const HANDOFF_CARD: HandoffCardData = {
  sessionId: "00000000-0000-4000-8000-0000000000a1",
  title: "October placeholder review",
  agentName: "Placeholder agent",
  address: "/placeholder/r1",
};

export const HANDOFF_ASK_ID = "00000000-0000-4000-8000-0000000000a0";

export const HANDOFF_BRIEF: BriefPartData = {
  title: HANDOFF_CARD.title,
  goal: "A short review of the October placeholder records for the board",
  facts: [
    {
      text: "3 records in October",
      dataset: "placeholder.records",
      asOf: "2026-10-27",
    },
  ],
  datasets: ["placeholder.records"],
  period: "October 2026",
  notPassed: ["The chart colors the person asked about"],
  charts: ["October records"],
};

export const HANDOFF_LABELS: ChatLabels = {
  steps: {
    "placeholder-surface-step": {
      active: "Noting a step",
      done: "Noted a step",
      failed: "Could not note a step",
    },
  },
  datasets: { "placeholder.records": "Placeholder records" },
  fields: {},
};

export const BRIEF_MESSAGE: AgentMessage = {
  id: "brief",
  role: "user",
  parts: [
    { type: "data-brief", data: HANDOFF_BRIEF },
    { type: "text", text: "Ask handed this work over to you." },
  ],
};

function answerOf(text: string): AgentMessage {
  return {
    id: "run-answer",
    role: "assistant",
    parts: [
      { type: "text", text: `root = Answer([p])\np = Paragraph("${text}")` },
    ],
  };
}

export const PARTIAL_ANSWER = answerOf("The first step is");

export const FULL_ANSWER = answerOf(
  "The placeholder record has its first step."
);

const RUN_STATE = {
  building: "running",
  stopping: "stopping",
} as const;

/** The `agent.session` read of the handed-over session with this run status. */
export function handoffDetail(
  run: AgentRunStatus | null,
  messages: readonly AgentMessage[] = [BRIEF_MESSAGE],
  handedFromSessionId: string | null = HANDOFF_ASK_ID
) {
  const session: AgentSessionDetail = {
    id: HANDOFF_CARD.sessionId,
    title: HANDOFF_CARD.title,
    modelId: "anthropic/claude-opus-5.5",
    surface: "placeholder",
    recordId: "r1",
    runState: run === "building" || run === "stopping" ? RUN_STATE[run] : null,
    updatedAt: "2026-10-27T02:00:00.000Z",
    handedFromSessionId,
    run,
    agentName: HANDOFF_CARD.agentName,
    address: HANDOFF_CARD.address,
  };

  return { session, messages };
}
