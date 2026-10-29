"use client";

import {
  type AnyContractRouter,
  type ContractRouterClient,
  isContractProcedure,
} from "@orpc/contract";
import { createContext, type ReactNode, use } from "react";

/* oxlint-disable anti-slop/no-unsafe-dictionary-type -- the app's client is one object of module routers, and this browser-safe entry cannot name their types. */
/** The app's one RPC client, as the provider gets it: each module's router sits under its id. */
export type ModuleClientRoot = Readonly<Record<string, unknown>>;
/* oxlint-enable anti-slop/no-unsafe-dictionary-type */

const ModuleClientContext = createContext<ModuleClientRoot | null>(null);

export function ModuleClientProvider(props: {
  readonly client: ModuleClientRoot;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ModuleClientContext value={props.client}>
      {props.children}
    </ModuleClientContext>
  );
}

/** The typed client of the module that owns `contract`, from the provider's client. */
export function useModuleClient<TContract extends AnyContractRouter>(
  contract: TContract
): ContractRouterClient<TContract> {
  const root = use(ModuleClientContext);

  if (root === null) {
    throw new Error("useModuleClient needs a ModuleClientProvider.");
  }

  return moduleClientOf(root, contract);
}

/** The first route path of the contract's procedures, depth first. */
function firstRoutePath(contract: AnyContractRouter): string | undefined {
  if (isContractProcedure(contract)) return contract["~orpc"].route.path;

  const router: { readonly [key: string]: AnyContractRouter } = contract;

  for (const child of Object.values(router)) {
    const path = firstRoutePath(child);

    if (path !== undefined) return path;
  }

  return undefined;
}

/** The pure half: the sub-client under the key that the contract's route paths start with. */
export function moduleClientOf<TContract extends AnyContractRouter>(
  root: ModuleClientRoot,
  contract: TContract
): ContractRouterClient<TContract> {
  const key = firstRoutePath(contract)?.split("/")[1];

  // Module validation refuses a contract whose paths do not start with "/<moduleId>", so the
  // browser never meets one; this keeps a wrong id from reading another module's procedure.
  if (key === undefined || key === "") {
    throw new Error(
      "A module contract with no routed procedure has no client."
    );
  }

  // SAFETY: ADR 0011 decision 7 and module validation make every path of a module contract start
  // with "/<moduleId>", and the app keys each module's router under that id, so `root[key]` is it.
  return root[key] as ContractRouterClient<TContract>;
}
