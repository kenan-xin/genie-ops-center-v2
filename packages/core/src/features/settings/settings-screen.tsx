"use client";

import {
  Button,
  ConfigForm,
  ConfirmDialog,
  focusRing,
  StatusPill,
  WarningNote,
} from "@genie/ui";
import { ArrowLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";

import {
  SectionFooter,
  SessionsSection,
  SignInSection,
  type FooterState,
} from "./core-sections.tsx";
import { resolveSettingsTarget } from "./settings-target.ts";
import type {
  LastChangedView,
  ModuleSettingsView,
  SettingsIssue,
  TenantSettingsScreenProps,
} from "./types.ts";

const SIGN_IN = "sign-in";

const SESSIONS = "sessions";

const CORE_FIELDS = new Map<string, readonly string[]>([
  [SIGN_IN, ["onboardingMode", "localAccountsEnabled"]],
  [SESSIONS, ["sessionIdleMinutes"]],
]);

type Section = {
  readonly id: string;
  readonly title: string;
  readonly group: "tenant" | "modules";
  readonly disabled: boolean;
};

/** A refused save as the screen uses it: the line's message and the issues to place on fields. */
const refusal = z
  .object({
    message: z.string().min(1),
    issues: z
      .array(z.object({ path: z.string(), message: z.string().min(1) }))
      .optional(),
  })
  .catch({ message: "The server refused the change." });

function SectionCard(props: {
  readonly title: string;
  readonly description: string | null;
  readonly headingRef: React.Ref<HTMLHeadingElement>;
  readonly extra?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-labelledby="settings-section-title"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex flex-col gap-3 px-5 pt-5">
        <div>
          <h2
            id="settings-section-title"
            ref={props.headingRef}
            tabIndex={-1}
            className={`text-base font-bold tracking-tight ${focusRing}`}
          >
            {props.title}
          </h2>
          {props.description === null ? null : (
            <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
              {props.description}
            </p>
          )}
        </div>
        {props.extra}
      </div>
      {props.children}
    </section>
  );
}

/**
 * Tenant settings as a section navigator (R-72 to R-80). One section shows at a time and saves on
 * its own; every path that leaves an edited section asks first. Saving writes settings only, never
 * a module's on or off state. No permission logic lives here: the read holds only what the viewer
 * may open (R-95).
 */
export function TenantSettingsScreen(props: TenantSettingsScreenProps) {
  const [detail, setDetail] = useState(props.target.section !== undefined);
  const [dirty, setDirty] = useState(false);
  const [guard, setGuard] = useState<{ readonly run: () => void } | null>(null);

  const [failure, setFailure] = useState<{
    readonly sectionId: string;
    readonly message: string;
    readonly issues: readonly SettingsIssue[];
  } | null>(null);

  const [resetKey, setResetKey] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const onDirtyChange = useCallback((next: boolean) => setDirty(next), []);

  const settings = props.settings;

  const sections: readonly Section[] = [
    {
      id: SIGN_IN,
      title: "Sign-in & accounts",
      group: "tenant",
      disabled: false,
    },
    { id: SESSIONS, title: "Sessions", group: "tenant", disabled: false },
    ...(settings?.modules ?? []).map((module): Section => ({
      id: module.moduleId,
      title: module.title,
      group: "modules",
      disabled: !module.enabled,
    })),
  ];

  const moduleOf = (id: string): ModuleSettingsView | undefined =>
    settings?.modules.find((module) => module.moduleId === id);

  const target = resolveSettingsTarget(
    sections.map((section) => section.id),
    (id) =>
      CORE_FIELDS.get(id) ??
      moduleOf(id)?.fields.map((field) => field.id) ??
      [],
    props.target
  );

  const current =
    sections.find((section) => section.id === target.sectionId) ?? sections[0];

  // A reload, a close or a full page load away asks the browser's own question while edited.
  useEffect(() => {
    if (!dirty) return undefined;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // A link to a known section at an unknown field lands on the section heading.
  useEffect(() => {
    if (
      settings !== undefined &&
      props.target.field !== undefined &&
      target.fieldId === null
    )
      heading.current?.focus();
  }, [settings, props.target.field, target.fieldId, target.sectionId]);

  useEffect(() => {
    if (target.fieldId === null || !CORE_FIELDS.has(target.sectionId)) return;

    document
      .querySelector(`[data-field="${CSS.escape(target.fieldId)}"]`)
      ?.querySelector<HTMLElement>(
        "input:not([aria-hidden]), [role=switch], [role=radio]"
      )
      ?.focus();
  }, [target.fieldId, target.sectionId, settings]);

  // Leaving an edited section asks first. Nothing is destructive, so the confirm is the plain one.
  const guarded = (run: () => void) => (dirty ? setGuard({ run }) : run());

  const leave = (run: () => void) =>
    guarded(() => {
      setDirty(false);
      setFailure(null);
      setResetKey((key) => key + 1);
      run();
    });

  const open = (id: string) =>
    leave(() => {
      setDetail(true);

      if (id !== target.sectionId || target.stale)
        props.onTargetChange({ section: id });
    });

  const save = (sectionId: string, write: () => Promise<void>) => async () => {
    setFailure(null);

    try {
      await write();
    } catch (cause) {
      const parsed = refusal.parse(cause);

      // Only a path this section's fields own becomes a field error; the rest stays in the line.
      const ids = new Set(
        CORE_FIELDS.get(sectionId) ??
          moduleOf(sectionId)?.fields.map((field) => field.id) ??
          []
      );

      setFailure({
        sectionId,
        message: parsed.message,
        issues: (parsed.issues ?? []).filter((issue) => ids.has(issue.path)),
      });
    }
  };

  const footer = (lastChanged: LastChangedView) => (state: FooterState) => {
    const shown =
      failure !== null && failure.sectionId === current?.id ? failure : null;

    return (
      <SectionFooter
        state={state}
        lastChanged={lastChanged}
        timeZone={props.timeZone}
        failure={shown?.message ?? null}
        // A field issue is fixed by editing that field, so Retry cannot succeed.
        retryable={shown === null || shown.issues.length === 0}
      />
    );
  };

  if (props.error !== undefined)
    return (
      <p role="alert" className="text-sm text-destructive">
        {props.error}
      </p>
    );

  if (settings === undefined || current === undefined)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading settings…
      </p>
    );

  const navRow = (section: Section) => {
    const active = section.id === current.id;

    return (
      <li key={section.id}>
        <button
          type="button"
          aria-current={active ? "true" : undefined}
          onClick={() => open(section.id)}
          className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm motion-safe:transition-colors md:min-h-10 ${focusRing} ${active ? "bg-card font-semibold text-primary ring-1 ring-border dark:text-brand-on-dark" : "font-medium text-foreground hover:bg-muted"}`}
        >
          <span className="min-w-0 flex-1 truncate">{section.title}</span>
          {active && dirty ? (
            <>
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-primary"
              />
              <span className="sr-only"> (unsaved)</span>
            </>
          ) : null}
          {section.disabled ? (
            <StatusPill tone="warning">Disabled</StatusPill>
          ) : null}
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground md:hidden"
          />
        </button>
      </li>
    );
  };

  const navigator = (
    <nav aria-label="Settings sections" className="flex flex-col">
      {(["tenant", "modules"] as const).map((group) => {
        const rows = sections.filter((section) => section.group === group);

        if (rows.length === 0) return null;

        return (
          <div key={group} className="flex flex-col pt-6 first:pt-0">
            <h2 className="px-3 pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {group === "tenant" ? "Tenant" : "Modules"}
            </h2>
            <ul className="flex flex-col gap-0.5">{rows.map(navRow)}</ul>
          </div>
        );
      })}
      <p className="mt-4 border-t border-border px-3 pt-3 text-xs text-muted-foreground">
        A module appears here only when it declares settings. Switching a module
        on or off happens on the Modules page.
      </p>
    </nav>
  );

  const sectionKey = `${current.id}:${resetKey}`;

  const content = () => {
    if (current.id === SIGN_IN)
      return (
        <SectionCard
          title="Sign-in & accounts"
          description="Who can sign in to this tenant, and how an account is created."
          headingRef={heading}
        >
          <SignInSection
            key={`${sectionKey}:${settings.core.lastChanged?.at ?? ""}`}
            values={{
              onboardingMode: settings.core.onboardingMode,
              localAccountsEnabled: settings.core.localAccountsEnabled,
            }}
            realmSupportsLocalAccounts={
              settings.core.realmSupportsLocalAccounts
            }
            localAccountsNote={
              props.localAccountsNotes[settings.core.realmMode]
            }
            issues={
              failure !== null && failure.sectionId === current.id
                ? failure.issues
                : undefined
            }
            onDirtyChange={onDirtyChange}
            onSubmit={(values) =>
              save(SIGN_IN, () => props.onSaveSignIn(values))()
            }
            footer={footer(settings.core.lastChanged)}
          />
        </SectionCard>
      );

    if (current.id === SESSIONS)
      return (
        <SectionCard
          title="Sessions"
          description="How long a signed-in browser stays signed in without activity."
          headingRef={heading}
        >
          <SessionsSection
            key={`${sectionKey}:${settings.core.lastChanged?.at ?? ""}`}
            values={{ sessionIdleMinutes: settings.core.sessionIdleMinutes }}
            issues={
              failure !== null && failure.sectionId === current.id
                ? failure.issues
                : undefined
            }
            onDirtyChange={onDirtyChange}
            onSubmit={(values) =>
              save(SESSIONS, () => props.onSaveSessions(values))()
            }
            footer={footer(settings.core.lastChanged)}
          />
        </SectionCard>
      );

    const module = moduleOf(current.id);

    if (module === undefined) return null;

    return (
      <SectionCard
        title={module.title}
        description={module.description}
        headingRef={heading}
        extra={
          module.enabled ? null : (
            <WarningNote size="md" role="status">
              <p className="font-semibold">{module.title} is switched off.</p>
              <p className="mt-0.5">
                Its settings stay editable, so the tenant can be prepared before
                the module is enabled. Saving here changes settings only: it
                never switches the module on. That happens on{" "}
                <a
                  href={props.modulesHref}
                  onClick={(event) => {
                    if (!dirty) return;

                    event.preventDefault();
                    guarded(() => window.location.assign(props.modulesHref));
                  }}
                  className={`font-semibold underline ${focusRing}`}
                >
                  Modules
                </a>
                .
              </p>
            </WarningNote>
          )
        }
      >
        <div className="px-5 py-5">
          <ConfigForm
            key={sectionKey}
            schema={module.schema}
            fields={module.fields}
            values={module.values}
            idPrefix={`cfg-${module.moduleId}`}
            focusFieldId={target.fieldId ?? undefined}
            issues={
              failure !== null && failure.sectionId === current.id
                ? failure.issues
                : undefined
            }
            onDirtyChange={onDirtyChange}
            onSubmit={(values) =>
              save(module.moduleId, () =>
                props.onSaveModule(module.moduleId, values)
              )()
            }
            footer={footer(module.lastChanged)}
          />
        </div>
      </SectionCard>
    );
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 pb-8">
      {target.stale ? (
        <p role="status" className="text-sm text-muted-foreground">
          That settings section does not exist, or you may not open it.
        </p>
      ) : null}

      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start">
        {/* Phone: the list is one screen and the section the next. Desktop: both at once. */}
        <div
          className={`min-w-0 md:w-58 md:shrink-0 md:self-stretch ${detail ? "hidden md:block" : ""}`}
        >
          <div className="rounded-xl bg-muted p-2 md:sticky md:top-4">
            {navigator}
          </div>
        </div>

        <div className={`min-w-0 flex-1 ${detail ? "" : "hidden md:block"}`}>
          <Button
            variant="ghost"
            className="mb-2 md:hidden"
            onClick={() => leave(() => setDetail(false))}
          >
            <ArrowLeft aria-hidden />
            All settings
          </Button>
          {content()}
        </div>
      </div>

      <ConfirmDialog
        open={guard !== null}
        title={`Discard the changes in ${current.title}?`}
        description="The changes you have not saved are dropped. Nothing was written yet."
        confirmLabel="Discard"
        danger={false}
        onConfirm={() => {
          guard?.run();
          setGuard(null);
        }}
        onClose={() => setGuard(null)}
      />
    </div>
  );
}
