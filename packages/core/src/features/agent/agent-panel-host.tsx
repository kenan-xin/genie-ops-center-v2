"use client";

import {
  Button,
  buttonVariants,
  Sheet,
  SheetContent,
  useMediaQuery,
} from "@genie/ui";
import { Maximize2Icon, PlusIcon, XIcon } from "lucide-react";
import {
  lazy,
  Suspense,
  use,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";

import type { ChatLabels, InboxLink } from "../../services/agent/index.ts";
import { ShellContext } from "../shell/shell-context.ts";
import { linkFor } from "../shell/shell-link.ts";
import {
  agentPanelStore,
  leaveOutPage,
  pageLeftOut,
  sentPageContext,
  setPanelOpen,
  setPanelWorking,
} from "./agent-panel-store.ts";

/**
 * The `sessionStorage` key, before `:<person id>`, that holds the panel's chat for this browser tab
 * (`czjw.60`).
 */
export const AGENT_PANEL_SESSION_KEY = "genie.agent-panel.session";

/**
 * The `sessionStorage` key, before `:<person id>`, that holds the id of the last chat with a stored
 * answer, so Open in Ask
 * names a chat that Ask can show, also after a page load (AG12).
 */
export const AGENT_PANEL_STORED_KEY = "genie.agent-panel.stored";

/** From this width the panel is a column beside the page (AG11). */
const DOCKED = "(min-width: 1280px)";

const ASK_HREF = "/ask";

// The conversation, `react-lang` and Recharts load in their own chunk when the panel first opens.
const LazyAgentChat = lazy(async () => ({
  default: (await import("./agent-chat.tsx")).AgentChat,
}));

const clearOutbox = () => agentPanelStore.setState({ outbox: null });

const pageFinished = () => agentPanelStore.getState().page?.onFinished?.();

const openInAsk = "Open in Ask";

/**
 * The agent panel of every signed-in page but Ask (R-42, `czjw.81`): from 1280 px a 400 px column,
 * the last item of the shell's row, so the page narrows and nothing covers it; below that a sheet.
 * It keeps the tab's chat, also after a page load, and only New chat starts another (AG7). A
 * page reaches it only through `useAgentPage`. Closed, the chat stays mounted, so an answer goes on.
 */
export function AgentPanelHost(props: {
  /** The signed-in person's id: the tab keeps one chat per person, so another sign-in starts afresh. */
  readonly person: string;
  readonly models: {
    readonly allowed: readonly string[];
    readonly chatDefault: string | null;
  } | null;
  readonly labels: ChatLabels;
  readonly suggestions: readonly string[];
  readonly inbox: readonly InboxLink[];
  readonly timeZone: string;
}): ReactNode {
  const shell = use(ShellContext);
  const open = useStore(agentPanelStore, (state) => state.open);
  const working = useStore(agentPanelStore, (state) => state.working);
  const page = useStore(agentPanelStore, (state) => state.page);
  const outbox = useStore(agentPanelStore, (state) => state.outbox);
  const leftOut = useStore(agentPanelStore, pageLeftOut);
  const docked = useMediaQuery(DOCKED, {});

  const sessionKey = `${AGENT_PANEL_SESSION_KEY}:${props.person}`;
  const storedKey = `${AGENT_PANEL_STORED_KEY}:${props.person}`;

  // The browser makes the id of a chat (P3); the tab keeps it, so a page load reopens the chat.
  const [sessionId, setSessionId] = useState(
    () => globalThis.sessionStorage?.getItem(sessionKey) ?? crypto.randomUUID()
  );

  useEffect(() => {
    sessionStorage.setItem(sessionKey, sessionId);
  }, [sessionKey, sessionId]);

  // A new chat has another id, so it counts as unstored until its first answer ends.
  const [stored, setStored] = useState(() =>
    globalThis.sessionStorage?.getItem(storedKey)
  );

  const finished = (id: string) => {
    sessionStorage.setItem(storedKey, id);
    setStored(id);
    pageFinished();
  };

  // The chat draws only once the panel opened, so a page load fetches no chat chunk.
  const [used, setUsed] = useState(false);
  // A new key reads the saved messages again, when the panel opens while no answer streams.
  const [loads, setLoads] = useState(0);
  const [shownOpen, setShownOpen] = useState(open);

  if (open !== shownOpen) {
    setShownOpen(open);

    if (open && !used) setUsed(true);
    else if (open && !working) setLoads(loads + 1);
  }

  // Set when the docked column closes, so focus goes back to the button that opened it.
  const returnFocus = useRef(false);

  useEffect(() => {
    if (open || !returnFocus.current) return;

    returnFocus.current = false;
    agentPanelStore.getState().opener?.focus();
  }, [open]);

  // Outside a shell (a module page's story) it draws; inside one, never on Ask.
  if (shell !== null && !shell.agentPanel) return null;

  function close(): void {
    returnFocus.current = docked;
    setPanelOpen(false);
  }

  // Ask shows a chat only once it has a stored answer; before that Open in Ask starts Ask afresh.
  const askHref = stored === sessionId ? `${ASK_HREF}/${sessionId}` : ASK_HREF;

  const Anchor = linkFor(askHref, shell?.linkComponent);

  // The line names the page the next message goes with; a left-out page shows none.
  const about = leftOut ? undefined : (page?.about ?? page?.context?.page);

  const panel = (
    <section
      aria-label="Agent"
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <header className="flex min-h-14 shrink-0 items-center gap-1 border-b border-border py-2 ps-4 pe-2">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${working ? "bg-primary motion-safe:animate-pulse" : "bg-muted-foreground"}`}
            />
            Agent
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSessionId(crypto.randomUUID())}
        >
          <PlusIcon aria-hidden="true" strokeWidth={1.75} />
          New chat
        </Button>
        {working ? (
          // The answer is stored only when it ends, so Ask would show the question alone.
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled
            aria-label={openInAsk}
          >
            <Maximize2Icon aria-hidden="true" strokeWidth={1.75} />
          </Button>
        ) : (
          <Anchor
            href={askHref}
            aria-label={openInAsk}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <Maximize2Icon aria-hidden="true" strokeWidth={1.75} />
          </Anchor>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close the agent panel"
          onClick={close}
        >
          <XIcon aria-hidden="true" strokeWidth={1.75} />
        </Button>
      </header>
      {/* The page the chat is about, on its own row so its filter shows in full (czjw.111). */}
      {about === undefined ? null : (
        <div className="shrink-0 border-b border-border px-4 py-2">
          <div className="inline-flex max-w-full items-start gap-1 rounded-lg bg-tile py-1 ps-2.5 pe-1 text-xs text-muted-foreground">
            <p
              title={about}
              className="line-clamp-2 min-w-0 self-center wrap-break-word"
            >
              About: {about}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Leave this page out of the chat"
              title="Leave this page out of the chat"
              onClick={leaveOutPage}
            >
              <XIcon aria-hidden="true" strokeWidth={1.75} />
            </Button>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        {used ? (
          <Suspense fallback={null}>
            <LazyAgentChat
              key={`${sessionId}:${loads}`}
              sessionId={sessionId}
              context={sentPageContext}
              models={props.models}
              labels={props.labels}
              suggestions={page?.suggestions ?? props.suggestions}
              inbox={props.inbox}
              timeZone={props.timeZone}
              artifacts={{
                kind: "link",
                href: (ref) => `/ask/${sessionId}?artifact=${ref.artifactId}`,
                rowsHref: (toolCallId) =>
                  `/ask/${sessionId}?rows=${toolCallId}`,
              }}
              headingLevel={3}
              onNewChat={() => setSessionId(crypto.randomUUID())}
              onWorking={setPanelWorking}
              pending={
                outbox === null
                  ? undefined
                  : { text: outbox.text, onSent: clearOutbox }
              }
              onFinished={finished}
            />
          </Suspense>
        ) : null}
      </div>
    </section>
  );

  // Both stay mounted while closed: a chat keeps its streamed answer.
  return docked ? (
    <aside
      aria-label="Agent panel"
      hidden={!open}
      className={`w-100 shrink-0 flex-col border-s border-border ${open ? "flex" : "hidden"}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      {panel}
    </aside>
  ) : (
    <Sheet open={open} onOpenChange={setPanelOpen}>
      <SheetContent
        side="right"
        showCloseButton={false}
        keepMounted
        aria-label="Agent"
        // oxlint-disable-next-line shadcn/no-restyle -- the panel brings its own header and padding
        className="gap-0 overflow-hidden p-0"
      >
        {panel}
      </SheetContent>
    </Sheet>
  );
}
