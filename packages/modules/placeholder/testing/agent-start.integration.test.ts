import {
  AGENT_RUN_JOB,
  callProcedure,
  chatTitleFrom,
  createAgentRouter,
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
  START_PART,
  startRecordRun,
  startText,
  type TenantContext,
} from "@genie/core";
import type { AgentSurface } from "@genie/core/contracts";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
  writeModelConnection,
} from "@genie/core/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { placeholderWithSurface, REFUSED_TITLE } from "./test-surface.ts";

/**
 * The start of a surface run from a record's page (S7-48): one transaction makes the record, the
 * surface session with the person's description as its first message, and the run, or saves
 * nothing. No run executes here, so no model is called.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const MODULES = [placeholderWithSurface];

const CHAT_MODEL = "openai/gpt-6.1-terra";

const MODEL_CONNECTION = {
  allowed: [CHAT_MODEL],
  chat: CHAT_MODEL,
  document: CHAT_MODEL,
};

const ALL_KEYS = ["core:ask:use", "placeholder:use", "placeholder:read"];

beforeAll(async () => {
  deployment = await startDisposableDeployment(MODULES);
  await markSetupDone(deployment.context);
  // Before any settings read, so the 10 s settings cache holds these values (DEC-46).
  await writeModelConnection(deployment.context, MODEL_CONNECTION);
  await enableModules(deployment.context, ["placeholder"]);
  registerModuleRuntime(deployment.context, MODULES);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

async function person(
  keys: readonly string[] = ALL_KEYS,
  tenant: TenantContext = deployment.context
): Promise<ModuleRequestContext> {
  const { userId } = await insertPersonWith(deployment.context, keys);

  return {
    tenant,
    caller: principalFor({
      tenant,
      modules: MODULES,
      userId,
      authenticated: true,
    }),
  };
}

function agent(ctx: ModuleRequestContext) {
  return callProcedure(createAgentRouter(), ctx);
}

const SESSION_ROWS = z.array(
  z.object({
    id: z.string(),
    surface: z.string(),
    record_id: z.string().nullable(),
    handed_from_session_id: z.string().nullable(),
    title: z.string(),
    model_id: z.string(),
    run_state: z.string().nullable(),
    run_job_id: z.string().nullable(),
  })
);

async function sessionsOf(ctx: ModuleRequestContext) {
  const { rows } = await deployment.context.db.execute(
    sql`select id, surface, record_id, handed_from_session_id, title, model_id, run_state, run_job_id from agent_session where user_id = ${ctx.caller.userId} order by created_at`
  );

  return SESSION_ROWS.parse(rows);
}

async function messagesOf(sessionId: string) {
  const { rows } = await deployment.context.db.execute(
    sql`select role, parts from agent_message where session_id = ${sessionId} order by seq`
  );

  return rows;
}

async function recordsLabelled(label: string) {
  const { rows } = await deployment.context.db.execute(
    sql`select id from placeholder_record where label = ${label}`
  );

  return z.array(z.object({ id: z.string() })).parse(rows);
}

/** The rows a refused start must leave as they were. */
async function savedBy(ctx: ModuleRequestContext, title: string) {
  const { rows } = await deployment.context.db.execute(
    sql`select count(*)::int as jobs from pgboss.job job join agent_session session on session.id::text = job.data->>'sessionId' where job.name = 'core.agent-run' and session.user_id = ${ctx.caller.userId}`
  );

  return {
    records: (await recordsLabelled(title)).length,
    sessions: (await sessionsOf(ctx)).length,
    jobs: rows[0]?.["jobs"],
  };
}

/** The deployment's tenant, whose surface list answers each surface with `acceptsHandoff` off. */
function tenantRefusingHandoff(): TenantContext {
  const { capabilities } = deployment.context;

  return {
    ...deployment.context,
    capabilities: {
      ...capabilities,
      list: async (name) => {
        const providers = await capabilities.list(name);

        if (name !== "agent-surface") return providers;

        return providers.map(({ moduleId, implementation }) => {
          // SAFETY: validateModule checked the provision against AgentSurface.
          const surface: AgentSurface = {
            ...(implementation as AgentSurface),
            acceptsHandoff: false,
          };

          return { moduleId, implementation: surface };
        });
      },
    },
  };
}

describe("the start of a surface run from a record page", () => {
  it("a start saves the record, the session with the description and a queued run", async () => {
    const ctx = await person();
    const description = "October collections\n\nfor the  board";

    const started = await agent(ctx).start({
      surface: "placeholder",
      description: `  ${description} `,
    });

    const title = chatTitleFrom(description);
    const [record] = await recordsLabelled(title);
    const sessions = await sessionsOf(ctx);

    expect({ started, sessions }).toEqual({
      started: {
        sessionId: sessions[0]?.id,
        recordId: record?.id,
        address: `/placeholder/${record?.id}?chat=${sessions[0]?.id}`,
      },
      sessions: [
        {
          id: expect.any(String),
          surface: "placeholder",
          record_id: record?.id,
          handed_from_session_id: null,
          title: "October collections for the board",
          model_id: CHAT_MODEL,
          run_state: "queued",
          run_job_id: expect.any(String),
        },
      ],
    });
    expect(await messagesOf(started.sessionId)).toEqual([
      {
        role: "user",
        parts: [
          { type: START_PART, data: { description } },
          { type: "text", text: startText(description) },
        ],
      },
    ]);
  });

  it("a fourth start while 3 runs are queued is refused and saves nothing", async () => {
    const ctx = await person();

    for (const description of ["First", "Second", "Third"]) {
      // oxlint-disable-next-line no-await-in-loop -- each start counts the runs before it.
      await startRecordRun(ctx, { surface: "placeholder", description });
    }

    const before = await savedBy(ctx, "Fourth review");

    await expect(
      startRecordRun(ctx, {
        surface: "placeholder",
        description: "Fourth review",
      })
    ).rejects.toMatchObject({ code: "agent-run-limit" });
    expect(await savedBy(ctx, "Fourth review")).toEqual(before);
  });

  it("with AI off a start is refused ai-off and saves nothing", async () => {
    const ctx = await person();

    // The stored key is read on every call, so removing it turns AI off at once.
    await deployment.context.db.execute(
      sql`delete from tenant_integration_key where name = 'model-provider'`
    );

    try {
      await expect(
        startRecordRun(ctx, {
          surface: "placeholder",
          description: "AI off review",
        })
      ).rejects.toMatchObject({ code: "ai-off" });
      expect(await savedBy(ctx, "AI off review")).toEqual({
        records: 0,
        sessions: 0,
        jobs: 0,
      });
    } finally {
      await writeModelConnection(deployment.context, MODEL_CONNECTION);
    }
  });

  it("a surface the person may not start is refused and saves nothing", async () => {
    const refusals = [
      { ctx: await person(), surface: "core:ask", code: "not-found" },
      {
        ctx: await person(ALL_KEYS, tenantRefusingHandoff()),
        surface: "placeholder",
        code: "not-found",
      },
      {
        ctx: await person(["core:ask:use", "placeholder:read"]),
        surface: "placeholder",
        code: "forbidden",
      },
    ];

    for (const { ctx, surface, code } of refusals) {
      // oxlint-disable-next-line no-await-in-loop -- one refusal at a time, each with its own person.
      await expect(
        startRecordRun(ctx, { surface, description: "Refused surface review" })
      ).rejects.toMatchObject({ code });
      // oxlint-disable-next-line no-await-in-loop -- as above.
      expect(await savedBy(ctx, "Refused surface review")).toEqual({
        records: 0,
        sessions: 0,
        jobs: 0,
      });
    }
  });

  it("a createRecord that throws saves no record, no session and no run", async () => {
    const ctx = await person();

    await expect(
      startRecordRun(ctx, {
        surface: "placeholder",
        description: REFUSED_TITLE,
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await savedBy(ctx, REFUSED_TITLE)).toEqual({
      records: 0,
      sessions: 0,
      jobs: 0,
    });
  });

  it("the session list tells a building run from a failed one", async () => {
    const ctx = await person();

    const { sessionId, recordId } = await startRecordRun(ctx, {
      surface: "placeholder",
      description: "Failing review",
    });

    const runOf = async () =>
      (await agent(ctx).sessions({ surface: "placeholder", recordId })).map(
        ({ id, run, handedFromSessionId }) => ({ id, run, handedFromSessionId })
      );

    // Bug caught: the list read loses whether a chat was handed over, so the deck page hides the
    // title of every deck handed over from Ask (S7-48).
    expect(await runOf()).toEqual([
      { id: sessionId, run: "building", handedFromSessionId: null },
    ]);

    const [session] = await sessionsOf(ctx);

    // A job with no caller ends its run `failed`, as a crashed start would.
    await AGENT_RUN_JOB.handler(
      { tenant: deployment.context },
      { sessionId, runJobId: session?.run_job_id ?? "" }
    );

    expect(await runOf()).toEqual([
      { id: sessionId, run: "failed", handedFromSessionId: null },
    ]);
  });
});
