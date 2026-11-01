"use client";

import { useState, type ReactNode } from "react";

import { useModuleClient } from "../../lib/rpc/module-client.tsx";
import { agentContract } from "../../services/agent/contract.ts";
import type { AgentMessage } from "../../services/agent/index.ts";
import type { CheckChart } from "./chart-check.tsx";
import { Conversation } from "./conversation.tsx";
import {
  AGENT_ROUTE,
  type AgentChatContext,
  agentTransport,
} from "./transport.ts";

const NO_MESSAGES: readonly AgentMessage[] = [];

/**
 * A new agent chat beside one record or one list (R-49, S7-13). Beside a record, every message
 * names it, so the prompt tells the model what "this" means; beside a list, no context is sent.
 * Each mount starts its own session (P3), and the chart gate goes through the app's client, which
 * holds the `agent` area.
 */
export function AgentPanel(props: {
  readonly context?: AgentChatContext;
  readonly models: {
    readonly allowed: readonly string[];
    readonly chatDefault: string | null;
  } | null;
  readonly timeZone: string;
  readonly newChatHref: string;
  readonly onFinished?: () => void;
}): ReactNode {
  const [sessionId] = useState(() => crypto.randomUUID());

  const [transport] = useState(() =>
    agentTransport(
      AGENT_ROUTE,
      props.context === undefined ? undefined : { context: props.context }
    )
  );

  const agent = useModuleClient(agentContract);

  const checkChart: CheckChart = (config) => agent.chart({ config });

  return (
    <Conversation
      sessionId={sessionId}
      initialMessages={NO_MESSAGES}
      transport={transport}
      models={props.models}
      checkChart={checkChart}
      timeZone={props.timeZone}
      newChatHref={props.newChatHref}
      onFinished={() => props.onFinished?.()}
    />
  );
}
