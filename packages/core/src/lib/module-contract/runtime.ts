import { registerSubscription } from "../../services/event-bus/index.ts";
import type { TenantContext } from "../tenant-context/index.ts";
import type { Module } from "./module.ts";

/**
 * Registers a compiled module list's runtime surface on one tenant context: the capability
 * providers and the event subscriptions each module declares. The application bootstrap and the
 * worker both call it with the same list, in the same order, so the queues an emitting process
 * sends to are the queues the worker drains.
 *
 * Registration is in memory only: it opens no connection, creates no queue, and checks no
 * entitlement. A durable subscription's queue is created on its first emit, and the worker gates
 * its jobs on the owning module's entitlement before each fetch.
 */
export function registerModuleRuntime(
  context: TenantContext,
  modules: readonly Module[]
): void {
  for (const module of modules) {
    for (const provision of module.capabilities) {
      context.capabilities.provide(provision.name, provision.implementation);
    }

    for (const subscription of module.subscriptions ?? []) {
      registerSubscription(context.events, module.identity.id, subscription);
    }
  }
}
