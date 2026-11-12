"use client";

import {
  Button,
  buttonVariants,
  Sheet,
  SheetContent,
  Tabs,
  TabsList,
  TabsTrigger,
  useMediaQuery,
} from "@genie/ui";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  FileTextIcon,
  Maximize2Icon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import {
  lazy,
  Suspense,
  use,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useStore } from "zustand";

import { useModuleClient } from "../../lib/rpc/module-client.tsx";
import { agentContract } from "../../services/agent/contract.ts";
import type { ChatLabels, InboxLink } from "../../services/agent/index.ts";
import {
  recordAddress,
  type SurfaceView,
  surfaceRecordOf,
} from "../../services/agent/surface-address.ts";
import { ShellContext } from "../shell/shell-context.ts";
import { linkFor } from "../shell/shell-link.ts";
import {
  agentPanelStore,
  sentPageContext,
  setBottomPanel,
  setPanelOpen,
  setPanelWorking,
} from "./agent-panel-store.ts";
import type { Read } from "./answer-sources.ts";
import type { ArtifactRef } from "./artifact-refs.ts";
import { ChatHistory } from "./chat-history.tsx";
import { useSessionDetail } from "./session-detail.ts";
import { surfaceSessionGroups } from "./session-groups.ts";

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

/** Below this width a surface's agent is a bottom panel over its record (P11-30). */
const PHONE = "(max-width: 767px)";

const ASK_HREF = "/ask";

const NO_SURFACES: readonly SurfaceView[] = [];

// The conversation, `react-lang` and Recharts load in their own chunk when the panel first opens.
const LazyAgentChat = lazy(async () => ({
  default: (await import("./agent-chat.tsx")).AgentChat,
}));

// The artifact sheet and its chart code load only when a card on a record page opens it.
const LazyArtifactSheet = lazy(async () => ({
  default: (await import("./artifact-slot.tsx")).ArtifactSheet,
}));

const focusedElement = () =>
  document.activeElement instanceof HTMLElement ? document.activeElement : null;

const clearOutbox = () => agentPanelStore.setState({ outbox: null });

const pageFinished = () => agentPanelStore.getState().page?.onFinished?.();

const openInAsk = "Open in Ask";

/**
 * The agent panel of every signed-in page but Ask (R-42, `czjw.81`): from 1280 px a 400 px column,
 * the last item of the shell's row, so the page narrows and nothing covers it; below that a sheet.
 * It keeps the tab's chat, also after a page load, and only New chat starts another (AG7). A
 * page reaches it only through `useAgentPage`. Closed, the chat stays mounted, so an answer goes on.
 *
 * On a surface's record page it is that surface's agent (R-42, S7-41): the surface's name, a
 * Building or Saved chip, the tabs This chat and Chats with this record's chats first, and no Open
 * in Ask. A new chat there is bound to the surface and the record. Below 768 px it is a bottom
 * panel with no backdrop, so the record that builds stays in view.
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
  /** The listed surfaces; none keeps the panel as Ask's on every page. */
  readonly surfaces?: readonly SurfaceView[] | undefined;
  /** The page's path, which the app passes in, as core imports no router. */
  readonly path?: string | undefined;
  /** Opens a page through the app's router. */
  readonly navigate?: ((href: string) => void) | undefined;
}): ReactNode {
  const shell = use(ShellContext);
  const agent = useModuleClient(agentContract);
  const open = useStore(agentPanelStore, (state) => state.open);
  const working = useStore(agentPanelStore, (state) => state.working);
  const page = useStore(agentPanelStore, (state) => state.page);
  const outbox = useStore(agentPanelStore, (state) => state.outbox);
  const docked = useMediaQuery(DOCKED, {});
  const phone = useMediaQuery(PHONE, {});

  const target = surfaceRecordOf(
    props.surfaces ?? NO_SURFACES,
    props.path ?? ""
  );

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

  // A surface page shows its record's newest chat, the chat the person picked, or a new one.
  const [tab, setTab] = useState("chat");

  const [collapsed, setCollapsed] = useState(false);

  const [picked, setPicked] = useState<{
    readonly recordId: string;
    readonly id: string;
  } | null>(null);

  const [fresh, setFresh] = useState(() => ({
    recordId: target?.recordId,
    id: crypto.randomUUID(),
  }));

  if (target !== undefined && fresh.recordId !== target.recordId) {
    setFresh({ recordId: target.recordId, id: crypto.randomUUID() });
  }

  const surfaceSessions = useQuery({
    queryKey: ["agent", "sessions", target?.surface.id, target?.recordId],
    queryFn: async () =>
      target === undefined
        ? []
        : agent.sessions({
            surface: target.surface.id,
            recordId: target.recordId,
          }),
    enabled: target !== undefined && used,
    staleTime: 0,
  });

  const surfaceSessionId =
    (picked !== null && picked.recordId === target?.recordId
      ? picked.id
      : undefined) ??
    surfaceSessions.data?.find(({ recordId }) => recordId === target?.recordId)
      ?.id ??
    fresh.id;

  const shownId = target === undefined ? sessionId : surfaceSessionId;

  // After the list, so the read is of the chat the panel shows, not the new id before it.
  const shownRead = useSessionDetail(shownId, {
    enabled: target !== undefined && used && surfaceSessions.isFetched,
  });

  // A surface chat's card opens its artifact or a read's rows in a sheet over the record page
  // (czjw.162). Another chat or record closes it.
  const [slot, setSlot] = useState<{
    readonly sessionId: string;
    readonly shown: ArtifactRef | null;
    readonly rows: Read | null;
    /** The card or link that opened it, which gets focus back on close. */
    readonly opener: HTMLElement | null;
  } | null>(null);

  // A closed panel also closes it, so a read that ends later opens no sheet over a hidden panel.
  if (slot !== null && (slot.sessionId !== shownId || !open)) setSlot(null);

  const openSlot = slot?.sessionId === shownId ? slot : null;

  const slotArtifacts = useQuery({
    queryKey: ["agent", "artifacts", shownId],
    queryFn: () => agent.artifacts({ id: shownId }),
    enabled: openSlot !== null && openSlot.shown !== null,
    staleTime: 0,
    retry: 1,
  });

  const run = shownRead.data?.session.run;

  const chip =
    run === "building" || run === "stopping"
      ? "Building"
      : run === "saved"
        ? "Saved"
        : undefined;

  // Set when the docked column or phone bottom panel closes, so focus goes back to the button that opened it.
  const returnFocus = useRef(false);

  useEffect(() => {
    if (open || !returnFocus.current) return;

    returnFocus.current = false;
    agentPanelStore.getState().opener?.focus();
  }, [open]);

  const bottom = target !== undefined && phone;

  // While the phone bottom panel shows, the shell pads the page by its height (P11-52).
  useEffect(() => {
    if (!bottom || !open) return;

    setBottomPanel(collapsed ? "collapsed" : "open");

    return () => setBottomPanel(null);
  }, [bottom, open, collapsed]);

  // Outside a shell (a module page's story) it draws; inside one, never on Ask.
  if (shell !== null && !shell.agentPanel) return null;

  function close(): void {
    returnFocus.current = docked || bottom;
    setPanelOpen(false);
  }

  // Base UI stops an Escape inside the portaled artifact sheet (P16d-39); the check is a safety net,
  // so a key from a portaled dialog that React still passes up never closes the panel.
  function closeOnEscape(event: KeyboardEvent<HTMLElement>): void {
    if (
      event.key === "Escape" &&
      event.target instanceof Node &&
      event.currentTarget.contains(event.target)
    ) {
      close();
    }
  }

  function newChat(): void {
    if (target === undefined) {
      setSessionId(crypto.randomUUID());

      return;
    }

    setPicked({ recordId: target.recordId, id: crypto.randomUUID() });
    setTab("chat");
  }

  // Ask shows a chat only once it has a stored answer; before that Open in Ask starts Ask afresh.
  const askHref = stored === sessionId ? `${ASK_HREF}/${sessionId}` : ASK_HREF;

  const Anchor = linkFor(askHref, shell?.linkComponent);

  // The line names the page that the next message goes with.
  const about = page?.about ?? page?.context?.page;

  const name = target?.surface.name ?? "Agent";

  const chat =
    used && (target === undefined || surfaceSessions.isFetched) ? (
      <Suspense fallback={null}>
        <LazyAgentChat
          key={`${shownId}:${loads}`}
          sessionId={shownId}
          context={sentPageContext}
          surface={
            target === undefined
              ? undefined
              : () => ({ id: target.surface.id, recordId: target.recordId })
          }
          models={props.models}
          labels={props.labels}
          suggestions={page?.suggestions ?? props.suggestions}
          inbox={props.inbox}
          timeZone={props.timeZone}
          artifacts={
            target === undefined
              ? {
                  kind: "link",
                  href: (ref) => `/ask/${shownId}?artifact=${ref.artifactId}`,
                  rowsHref: (toolCallId) =>
                    `/ask/${shownId}?rows=${toolCallId}`,
                }
              : {
                  kind: "panel",
                  shown: openSlot?.shown ?? null,
                  onOpen: (ref) =>
                    setSlot({
                      sessionId: shownId,
                      shown: ref,
                      rows: null,
                      opener: focusedElement(),
                    }),
                  onOpenRows: (read) =>
                    setSlot({
                      sessionId: shownId,
                      shown: null,
                      rows: read,
                      opener: focusedElement(),
                    }),
                }
          }
          headingLevel={3}
          onNewChat={newChat}
          onWorking={setPanelWorking}
          pending={
            outbox === null
              ? undefined
              : { text: outbox.text, onSent: clearOutbox }
          }
          onFinished={
            target === undefined
              ? finished
              : () => {
                  pageFinished();
                  void surfaceSessions.refetch();
                }
          }
          // The record page reads its record again as the run builds it.
          onProgress={pageFinished}
          // Off a surface page, a handoff opens the page that builds, with the panel open.
          onHandoff={
            target === undefined
              ? (card) => props.navigate?.(card.address)
              : undefined
          }
        />
      </Suspense>
    ) : null;

  const panel = (
    <section
      aria-label={name}
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <header className="flex min-h-14 shrink-0 items-center gap-1 border-b border-border py-2 ps-4 pe-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${working ? "bg-primary motion-safe:animate-pulse" : "bg-muted-foreground"}`}
            />
            <span className="truncate">{name}</span>
          </h2>
          {target === undefined || chip === undefined ? null : (
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {chip}
            </span>
          )}
        </div>
        {target === undefined ? (
          <Button type="button" variant="ghost" size="sm" onClick={newChat}>
            <PlusIcon aria-hidden="true" strokeWidth={1.75} />
            New chat
          </Button>
        ) : (
          // An icon beside the chip, so the surface's name shows in full at 390 px.
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="New chat"
            onClick={newChat}
          >
            <PlusIcon aria-hidden="true" strokeWidth={1.75} />
          </Button>
        )}
        {target !== undefined ? null : working ? (
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
        {bottom ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Show more" : "Show less"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronUpIcon aria-hidden="true" strokeWidth={1.75} />
            ) : (
              <ChevronDownIcon aria-hidden="true" strokeWidth={1.75} />
            )}
          </Button>
        ) : null}
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
      {/* The page the agent knows about, on its own row so its filter shows in full (czjw.111, czjw.165). */}
      {about === undefined || (bottom && collapsed) ? null : (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-sm text-muted-foreground">
          <FileTextIcon
            aria-hidden="true"
            className="size-4 shrink-0"
            strokeWidth={1.75}
          />
          <p title={about} className="line-clamp-2 min-w-0 wrap-break-word">
            This page: {about}
          </p>
        </div>
      )}
      <div
        hidden={bottom && collapsed}
        className={`min-h-0 flex-1 flex-col ${bottom && collapsed ? "hidden" : "flex"}`}
      >
        {target === undefined ? (
          chat
        ) : (
          <>
            <div className="shrink-0 border-b border-border px-4 py-2">
              <Tabs
                value={tab}
                onValueChange={(value) => setTab(String(value))}
              >
                <TabsList>
                  <TabsTrigger value="chat">This chat</TabsTrigger>
                  <TabsTrigger value="chats">Chats</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {/* Both panels stay mounted, so a chat keeps its streamed answer on the Chats tab. */}
            <div
              role="tabpanel"
              aria-label="This chat"
              hidden={tab !== "chat"}
              className={`min-h-0 flex-1 flex-col ${tab === "chat" ? "flex" : "hidden"}`}
            >
              {chat}
            </div>
            <div
              role="tabpanel"
              aria-label="Chats"
              hidden={tab !== "chats"}
              className={`min-h-0 flex-1 flex-col ${tab === "chats" ? "flex" : "hidden"}`}
            >
              <p className="px-6 pt-3 text-xs text-muted-foreground">
                Only {name} chats. Ask chats stay in Ask.
              </p>
              <ChatHistory
                sessions={surfaceSessions.data ?? []}
                currentId={shownId}
                timeZone={props.timeZone}
                groups={(sessions) =>
                  surfaceSessionGroups(sessions, target.recordId)
                }
                onPick={(session) => {
                  if (session.recordId === target.recordId) {
                    setPicked({ recordId: target.recordId, id: session.id });
                    setTab("chat");
                  } else if (session.recordId !== null) {
                    // The pick holds for that record, so its page opens on this chat.
                    setPicked({ recordId: session.recordId, id: session.id });
                    setTab("chat");
                    props.navigate?.(
                      recordAddress(target.surface.recordPage, session.recordId)
                    );
                  }
                }}
              />
            </div>
          </>
        )}
      </div>
      {openSlot !== null &&
      openSlot.shown !== null &&
      slotArtifacts.isError &&
      slotArtifacts.data === undefined ? (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-2 text-sm text-muted-foreground"
        >
          <p className="flex-1">The artifact could not load.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void slotArtifacts.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {/* Portaled, and inside the panel's own sheet below 1280 px, so it nests as a dialog. An
          artifact waits for the chat's artifacts, so the sheet never opens on an empty list. */}
      {openSlot === null ||
      (openSlot.shown !== null && slotArtifacts.data === undefined) ? null : (
        <Suspense fallback={null}>
          <LazyArtifactSheet
            artifacts={slotArtifacts.data ?? []}
            shown={openSlot.shown}
            rows={openSlot.rows}
            labels={props.labels}
            timeZone={props.timeZone}
            onShow={(ref) => setSlot({ ...openSlot, shown: ref, rows: null })}
            onClose={() => setSlot(null)}
            // Base UI would return focus to Try again's row, gone by then, after a failed read.
            finalFocus={openSlot.opener}
          />
        </Suspense>
      )}
    </section>
  );

  // Every frame stays mounted while closed: a chat keeps its streamed answer.
  if (bottom) {
    return (
      <aside
        aria-label="Agent panel"
        hidden={!open}
        className={`fixed inset-x-0 bottom-0 z-40 flex-col overflow-hidden rounded-t-xl border-t border-border shadow-xl ${open ? "flex" : "hidden"} ${collapsed ? "" : "h-1/2"}`}
        onKeyDown={closeOnEscape}
      >
        {panel}
      </aside>
    );
  }

  return docked ? (
    <aside
      aria-label="Agent panel"
      hidden={!open}
      className={`w-100 shrink-0 flex-col border-s border-border ${open ? "flex" : "hidden"}`}
      onKeyDown={closeOnEscape}
    >
      {panel}
    </aside>
  ) : (
    <Sheet open={open} onOpenChange={setPanelOpen}>
      <SheetContent
        side="right"
        showCloseButton={false}
        keepMounted
        aria-label={name}
        // oxlint-disable-next-line shadcn/no-restyle -- the panel brings its own header and padding
        className="gap-0 overflow-hidden p-0"
      >
        {panel}
      </SheetContent>
    </Sheet>
  );
}
