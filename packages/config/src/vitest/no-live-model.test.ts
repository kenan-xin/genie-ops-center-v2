import { expect, it } from "vitest";

// Every call carries a pre-aborted signal. With the guard installed it never
// reaches the inner fetch; before the setup file is wired the fetch stops in the
// process on that signal, so a red run sends nothing either way.
const preAborted = { signal: AbortSignal.abort() };

it("refuses a request to a model host before it leaves the process, and lets other hosts through", async () => {
  await expect(
    fetch("https://openrouter.ai/api/v1/chat/completions", preAborted)
  ).rejects.toThrow(/live model host openrouter\.ai/);

  await expect(
    fetch("https://openrouter.ai./api/v1/chat/completions", preAborted)
  ).rejects.toThrow(/live model host openrouter\.ai/);

  await expect(
    fetch("https://ai-gateway.vercel.sh/v4/ai", preAborted)
  ).rejects.toThrow(/live model host ai-gateway\.vercel\.sh/);

  await expect(fetch("http://127.0.0.1:9/x", preAborted)).rejects.toMatchObject(
    {
      name: "AbortError",
    }
  );
});
