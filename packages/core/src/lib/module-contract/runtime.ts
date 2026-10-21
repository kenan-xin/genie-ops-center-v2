import { registerSubscription } from "../../services/event-bus/index.ts";
import type { TenantContext } from "../tenant-context/index.ts";
import type { Module } from "./module.ts";

/** The contexts whose runtime surface is registered, so a second registration is refused. */
const registered = new WeakSet<TenantContext>();

/**
 * Registers a compiled module list's runtime surface on one tenant context: the capability
 * providers and the event subscriptions each module declares. The application bootstrap and the
 * worker both call it with the same list, in the same order, so the queues an emitting process
 * sends to are the queues the worker drains.
 *
 * Registration is in memory only: it opens no connection, creates no queue, and checks no
 * entitlement. A durable subscription's queue is created on its first emit, and the worker gates
 * its jobs on the owning module's entitlement before each fetch.
 *
 * A context is registered once. A second call throws, because it would run every fast handler
 * twice and give each durable subscription a second queue.
 */
export function registerModuleRuntime(
  context: TenantContext,
  modules: readonly Module[]
): void {
  if (registered.has(context)) {
    throw new Error(
      "registerModuleRuntime already ran on this tenant context."
    );
  }

  registered.add(context);

  for (const module of modules) {
    for (const provision of module.capabilities) {
      context.capabilities.provide(provision.name, provision.implementation);
    }

    for (const subscription of module.subscriptions ?? []) {
      registerSubscription(context.events, module.identity.id, subscription);
    }
  }
}
