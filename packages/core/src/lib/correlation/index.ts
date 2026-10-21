import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The correlation id of the running request, event handler or job, held on the async context so a
 * service deep in a call stack reads it without threading it through every parameter. It is the
 * same per-request pattern as `services/auth/request-scope.ts`, kept separate because it carries a
 * different fact: `AuthRequestScope` holds one request's OAuth result, this holds the one id the
 * whole chain of a request and its follow-up events shares.
 *
 * The event bus reads `current()` at an emit. An emit inside a handler inherits the handled
 * envelope's id, an emit inside a request inherits the request id the application set at the
 * boundary, and an emit outside both mints a fresh id. Every handler runs inside `run` with the id
 * of the envelope it was handed, so a chain request -> event -> handler -> event shares one id,
 * durable delivery through the worker included.
 */
export class CorrelationScope {
  readonly #storage = new AsyncLocalStorage<string>();

  /** Runs `fn` with `correlationId` as the current id for this async context and its children. */
  run<T>(correlationId: string, fn: () => Promise<T>): Promise<T> {
    return this.#storage.run(correlationId, fn);
  }

  /** The id of the running request, event handler or job, or `undefined` outside one. */
  current(): string | undefined {
    return this.#storage.getStore();
  }
}
