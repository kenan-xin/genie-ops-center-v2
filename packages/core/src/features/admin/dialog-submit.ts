import { useState } from "react";
import { z } from "zod";

// The host's rejection carries the copy to show as its `message`.
const Refusal = z.object({ message: z.string().min(1) });

// A rejection that carries no copy, which a host that follows the contract never sends.
const NOT_SAVED = "That change could not be saved. Try again.";

/**
 * The submit of an admin form dialog (tokens.md U-1). The dialog waits for the host's promise and
 * closes only when it resolves. A refusal rejects with the copy to show as its `message`; the
 * dialog stays open with the typed values and shows that copy in its action bar. `clear` runs on
 * Cancel, so the next open starts without a stale refusal.
 */
export function useDialogSubmit() {
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (
    work: () => Promise<void> | void,
    onSaved: () => void
  ) => {
    setFailure(null);
    setSubmitting(true);

    try {
      await work();
      onSaved();
    } catch (cause) {
      setFailure(Refusal.safeParse(cause).data?.message ?? NOT_SAVED);
    } finally {
      setSubmitting(false);
    }
  };

  return { failure, submitting, submit, clear: () => setFailure(null) };
}
