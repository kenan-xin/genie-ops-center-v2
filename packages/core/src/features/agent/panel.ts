/**
 * The light entry of the agent panel: the frame, the button and the page seam. The conversation
 * loads in its own chunk when the panel first draws, so the shell's first chunk stays small.
 */
export {
  type AgentPage,
  useAgentPage,
  useAgentPanel,
} from "./agent-panel-store.ts";

export {
  AGENT_PANEL_SESSION_KEY,
  AgentPanelHost,
} from "./agent-panel-host.tsx";

export { AgentButton } from "./agent-button.tsx";
