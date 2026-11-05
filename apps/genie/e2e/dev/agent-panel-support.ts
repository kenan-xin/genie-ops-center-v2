import {
  createTenantContext,
  type TenantContext,
  withTransaction,
} from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import {
  insertDocument,
  LIVE_UPLOADS,
  readDemoFile,
} from "@genie/module-invoices/testing";

import { selectedModuleIds } from "../../src/modules.ts";
import {
  DOCUMENT_REVIEW_CHAT_ID,
  DOCUMENT_REVIEW_CHAT_READING,
} from "../../testing/document-review-chat.ts";
import { DATABASE_URL, PUBLIC_URL } from "./dev-support.ts";
import { DEMO_ACCOUNT_EMAIL } from "./global-setup.ts";

/**
 * What the agent panel spec shares: the fixed document of `document-review-chat.ts` on the demo
 * database. It has no file name, so its label is the one the recorded tool result holds (D12).
 */

let tenantContext: TenantContext | undefined;

/** The spec process's own tenant context, built as `global-setup.ts` builds one. */
function context(): TenantContext {
  tenantContext ??= createTenantContext(
    { DATABASE_URL, PUBLIC_URL },
    silentLogger(),
    selectedModuleIds,
    undefined,
    "core"
  );

  return tenantContext;
}

/** Frees the pool this process's context opened, so Playwright exits without it. */
export async function closeAgentPanelDatabase(): Promise<void> {
  await tenantContext?.db.$client.end();

  tenantContext = undefined;
}

/** Deletes the fixed document and its file, whatever a killed run left. */
export async function removeReviewDocument(): Promise<void> {
  const tenant = context();

  await withTransaction(tenant, async (tx) => {
    const deleted = await tx.execute<{ file_id: string }>(
      `delete from "document" where id = '${DOCUMENT_REVIEW_CHAT_ID}' returning file_id`
    );

    await tenant.fileStorage.remove(
      deleted.rows.map((row) => row.file_id),
      tx
    );
  });
}

/**
 * Puts the fixed document back with one demo pack PDF stored through `FileStorage`, so its review
 * page draws. Call it under the ledger lock, and `removeReviewDocument` after the test, because
 * the inbox counts of the other specs must not see it.
 */
export async function resetReviewDocument(): Promise<void> {
  await removeReviewDocument();

  const tenant = context();

  const { rows } = await tenant.db.$client.query<{ id: string }>(
    'select id from "user" where email = $1',
    [DEMO_ACCOUNT_EMAIL]
  );

  const uploadedByUserId = rows[0]?.id;

  if (uploadedByUserId === undefined)
    throw new Error("The demo account does not exist.");

  const file = LIVE_UPLOADS[0];

  if (file === undefined) throw new Error("The demo pack has no live upload.");

  const { id: fileId } = await withTransaction(tenant, (tx) =>
    tenant.fileStorage.store(
      {
        fileName: file,
        mimeType: "application/pdf",
        bytes: readDemoFile(`03_Live_Upload_Documents/${file}`),
        uploadedByUserId,
      },
      tx
    )
  );

  await insertDocument(tenant, {
    id: DOCUMENT_REVIEW_CHAT_ID,
    kind: "invoice",
    fileId,
    reading: DOCUMENT_REVIEW_CHAT_READING,
  });
}
