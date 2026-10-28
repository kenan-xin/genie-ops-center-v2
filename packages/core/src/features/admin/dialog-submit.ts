import { useRef, useState } from "react";
import { z } from "zod";

// The host's rejection carries the copy to show as its `message`, and any field issues.
const Refusal = z.object({
  message: z.string().min(1),
  issues: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .default([]),
});

type Issue = { readonly path: string; readonly message: string };

// A rejection that carries no copy, which a host that follows the contract never sends.
const NOT_SAVED = "That change could not be saved. Try again.";

/**
 * The submit of an admin form dialog (tokens.md U-1). The dialog waits for the host's promise and
 * closes only when it resolves. A refusal rejects with the copy to show as its `message`; the
 * dialog stays open with the typed values and shows that copy in its action bar, or the copy of an
 * issue at its field. `clear` runs on
 * Cancel, so the next open starts without a stale refusal, and an answer that arrives after Cancel
 * is dropped.
 */
export function useDialogSubmit() {
  const [failure, setFailure] = useState<string | null>(null);
  const [issues, setIssues] = useState<readonly Issue[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Each submit and each Cancel starts a new generation; only the current one may report.
  const generation = useRef(0);

  const submit = async (
    work: () => Promise<void> | void,
    onSaved: () => void
  ) => {
    const current = ++generation.current;

    setFailure(null);
    setIssues([]);
    setSubmitting(true);

    try {
      await work();

      if (current === generation.current) onSaved();
    } catch (cause) {
      if (current === generation.current) {
        const refusal = Refusal.safeParse(cause).data;

        setFailure(refusal?.message ?? NOT_SAVED);
        setIssues(refusal?.issues ?? []);
      }
    } finally {
      if (current === generation.current) setSubmitting(false);
    }
  };

  const clear = () => {
    generation.current += 1;
    setFailure(null);
    setIssues([]);
    setSubmitting(false);
  };

  return { failure, issues, submitting, submit, clear };
}
