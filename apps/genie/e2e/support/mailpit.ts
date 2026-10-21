import { standinMailpitUrl } from "../../testing/e2e-keycloak.ts";

/**
 * The Mailpit stand-in's HTTP API, for a browser proof that an email actually went out. The app's
 * mailer and the local-accounts realm both deliver to this sink over SMTP; the spec reads it back
 * over the API on loopback.
 */

type MailpitAddress = {
  readonly Address: string;
  readonly Name?: string;
};

type MailpitSummary = {
  readonly ID: string;
  readonly Subject: string;
  readonly To: readonly MailpitAddress[];
  readonly Created: string;
};

export type MailpitMessage = {
  readonly ID: string;
  readonly Subject: string;
  readonly HTML: string;
  readonly Text: string;
};

/** Empties the sink, so a spec reads only the messages its own action sent. */
export async function clearMailpit(): Promise<void> {
  await fetch(`${standinMailpitUrl()}/api/v1/messages`, {
    method: "DELETE",
  }).catch(() => undefined);
}

async function summariesTo(email: string): Promise<readonly MailpitSummary[]> {
  const response = await fetch(
    `${standinMailpitUrl()}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
  );

  if (!response.ok) return [];

  // SAFETY: Mailpit's search endpoint answers the documented `{ messages: [...] }` shape; only
  // `ID` and `To` are read.
  const body = (await response.json()) as {
    readonly messages?: readonly MailpitSummary[];
  };

  return body.messages ?? [];
}

/**
 * Waits until at least one message addressed to `email` has arrived and returns the newest. The
 * delivery is asynchronous (SMTP or the realm's own sender), so the spec polls rather than
 * assuming the message is there the moment the write returns.
 */
export async function waitForMessageTo(
  email: string,
  options: { readonly timeoutMs?: number } = {}
): Promise<MailpitMessage> {
  const deadline = Date.now() + (options.timeoutMs ?? 30000);

  /* eslint-disable no-await-in-loop -- polling waits for an external delivery. */
  while (Date.now() < deadline) {
    const summaries = await summariesTo(email);

    const newest = summaries.toSorted((left, right) =>
      right.Created.localeCompare(left.Created)
    )[0];

    if (newest !== undefined) {
      const response = await fetch(
        `${standinMailpitUrl()}/api/v1/message/${newest.ID}`
      );

      if (response.ok) {
        // SAFETY: the message endpoint answers the documented message shape; only the body parts
        // and subject are read.
        return (await response.json()) as MailpitMessage;
      }
    }

    await new Promise((settle) => setTimeout(settle, 500));
  }
  /* eslint-enable no-await-in-loop */

  throw new Error(`No Mailpit message addressed to ${email} arrived in time`);
}

/** Every URL in a message's HTML and text parts, HTML-entity decoded, in order. */
export function linksIn(message: MailpitMessage): readonly string[] {
  const haystack = `${message.HTML}\n${message.Text}`;

  const raw = haystack.match(/https?:\/\/[^\s"'<>()]+/g) ?? [];

  return raw
    .map((url) => url.replaceAll("&amp;", "&"))
    .map((url) => url.replace(/[.,;]+$/, ""));
}

/**
 * Waits until a message addressed to `email` carries a link the matcher accepts, and returns it.
 * The realm's own sender is asynchronous, so the spec polls every message to that address rather
 * than assuming which one carries the link.
 */
export async function waitForLink(
  email: string,
  matcher: (url: string) => boolean,
  options: { readonly timeoutMs?: number } = {}
): Promise<string> {
  const deadline = Date.now() + (options.timeoutMs ?? 30000);

  /* eslint-disable no-await-in-loop -- polling waits for an external delivery. */
  while (Date.now() < deadline) {
    for (const summary of await summariesTo(email)) {
      const response = await fetch(
        `${standinMailpitUrl()}/api/v1/message/${summary.ID}`
      );

      if (!response.ok) continue;

      // SAFETY: the message endpoint answers the documented message shape; only the body parts
      // are read.
      const message = (await response.json()) as MailpitMessage;

      const link = linksIn(message).find(matcher);

      if (link !== undefined) return link;
    }

    await new Promise((settle) => setTimeout(settle, 500));
  }
  /* eslint-enable no-await-in-loop */

  throw new Error(
    `No Mailpit message addressed to ${email} carried a matching link in time`
  );
}
