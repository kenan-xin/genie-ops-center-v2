import {
  type AnySchema,
  type ContractProcedureDef,
  type ErrorMap,
  getContractRouter,
  isContractProcedure,
  type Meta,
} from "@orpc/contract";
import {
  getRouter,
  isLazy,
  type Lazyable,
  isProcedure,
  traverseContractProcedures,
} from "@orpc/server";
import { isPlainObject } from "es-toolkit";
import { ZodType } from "zod";

import {
  type ModuleContract,
  type ModuleRouter,
  ownerOfRouter,
} from "./implement-module.ts";

/**
 * The router and contract half of module validation (ADR 0011). oRPC checks that a router matches
 * its contract only in types, and a missing procedure otherwise fails at request time, so this
 * refuses at validation:
 *
 * - a router `implementModule` did not build for this id, or built from another contract, because
 *   the entitlement gate reads the id it was built with (d1y);
 * - a contract procedure the router does not resolve, and a router procedure the contract does not
 *   declare, because the browser client and the OpenAPI document read only the contract;
 * - a router procedure that does not start with the entitlement gate and the session check, or
 *   that validates its input before them;
 * - a lazy router, which would hide its procedures from these checks;
 * - a contract key `implementModule` reserves (`router`, `use`, `lazy`, `middleware`);
 * - decision 7: a procedure with no route, a path outside `/<moduleId>/` or with an empty, `.` or
 *   `..` segment, or a `GET` or `HEAD` whose input is not an object, because it carries its input
 *   in the query string.
 *
 * Returns every problem rather than throwing, like the rest of module validation.
 */
export function moduleApiProblems(
  moduleId: string,
  router: ModuleRouter,
  contract: ModuleContract
): readonly string[] {
  const owner = ownerOfRouter(router);

  if (owner === undefined) {
    return [
      `Module "${moduleId}" has a router not built by implementModule("${moduleId}", contract).`,
    ];
  }

  if (owner.id !== moduleId) {
    return [
      `Module "${moduleId}" has a router built by implementModule("${owner.id}", ...). It must use "${moduleId}".`,
    ];
  }

  if (owner.contract !== contract) {
    return [
      `Module "${moduleId}" has a router built from a contract other than the one it declares.`,
    ];
  }

  return [
    ...contractProblems(moduleId, router, contract),
    ...contractRouteProblems(moduleId, contract),
    ...routerProblems(moduleId, router, [], owner.gates, contract),
  ];
}

/** The contract's procedures: each implemented and under no reserved key. */
function contractProblems(
  moduleId: string,
  router: ModuleRouter,
  contract: ModuleContract
): readonly string[] {
  const problems: string[] = [];

  traverseContractProcedures({ router: contract, path: [] }, ({ path }) => {
    const name = path.join(".");
    const reserved = path.find((key) => RESERVED_KEYS.has(key));

    if (reserved !== undefined) {
      problems.push(
        `Module "${moduleId}" names procedure "${name}" with the key "${reserved}", which implementModule reserves.`
      );
    }

    const implemented = getRouter(router, path);

    // A lazy entry is reported once, by routerProblems.
    if (!isProcedure(implemented) && !isLazy(implemented)) {
      problems.push(
        `Module "${moduleId}" declares procedure "${name}" that its router does not implement.`
      );
    }
  });

  return problems;
}

/**
 * Decision 7 for every procedure of a contract under `/<prefix>/`. Module validation runs it with
 * the module id; core's own areas are not modules, so their tests run it with the area name.
 */
export function contractRouteProblems(
  prefix: string,
  contract: ModuleContract
): readonly string[] {
  const problems: string[] = [];

  traverseContractProcedures(
    { router: contract, path: [] },
    ({ contract: procedure, path }) => {
      problems.push(
        ...routeProblems(prefix, path.join("."), procedure["~orpc"])
      );
    }
  );

  return problems;
}

/** Path segments that would let a route leave the module prefix or alias another route. */
const UNSAFE_SEGMENTS: ReadonlySet<string> = new Set(["", ".", ".."]);

/** RPC answers a HEAD as a GET, so both carry their input in the query string. */
const QUERY_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

/** Keys `implementModule` answers itself, so a contract key of that name could not be implemented. */
const RESERVED_KEYS: ReadonlySet<string> = new Set([
  "router",
  "use",
  "lazy",
  "middleware",
]);

/** The router's own procedures: each must be declared by the contract and start with the gates. */
function routerProblems(
  moduleId: string,
  entry: Lazyable<ModuleRouter> | undefined,
  path: readonly string[],
  gates: readonly unknown[],
  contract: ModuleContract
): readonly string[] {
  const name = path.join(".");

  if (isLazy(entry)) {
    return [
      `Module "${moduleId}" has a lazy router at "${name}": lazy routers are not supported.`,
    ];
  }

  if (isProcedure(entry)) {
    if (!isContractProcedure(getContractRouter(contract, path))) {
      return [
        `Module "${moduleId}" serves procedure "${name}" that its contract does not declare.`,
      ];
    }

    const { middlewares, inputValidationIndex } = entry["~orpc"];

    const gated =
      gates.every((gate, index) => middlewares[index] === gate) &&
      inputValidationIndex >= gates.length;

    return gated
      ? []
      : [
          `Procedure "${name}" of module "${moduleId}" does not run the entitlement gate and the session check before input validation.`,
        ];
  }

  // Only reachable through a type escape; recursing into a string would never end.
  if (!isPlainObject(entry)) return [];

  return Object.entries(entry).flatMap(([key, child]) =>
    routerProblems(moduleId, child, [...path, key], gates, contract)
  );
}

/** Decision 7 for one procedure: a route, under the module's own prefix, and a GET input that fits a query. */
function routeProblems(
  moduleId: string,
  name: string,
  {
    route,
    inputSchema,
  }: ContractProcedureDef<AnySchema, AnySchema, ErrorMap, Meta>
): readonly string[] {
  const where = `Procedure "${name}" of module "${moduleId}"`;

  if (route.method === undefined || route.path === undefined) {
    return [`${where} declares no route. Use oc.route({ method, path }).`];
  }

  const problems: string[] = [];
  const prefix = `/${moduleId}/`;

  if (!route.path.startsWith(prefix)) {
    problems.push(
      `${where} has path "${route.path}". A module path starts with "${prefix}".`
    );
  }

  if (
    route.path
      .split("/")
      .slice(1)
      .some((segment) => UNSAFE_SEGMENTS.has(segment))
  ) {
    problems.push(
      `${where} has path "${route.path}" with an empty, "." or ".." segment.`
    );
  }

  if (QUERY_METHODS.has(route.method) && !isQueryInput(inputSchema)) {
    problems.push(
      `${where} is a ${route.method} with an input that is not an object.`
    );
  }

  return problems;
}

/** A GET carries its input in the query string: no input, or a zod object. */
function isQueryInput(schema: AnySchema | undefined): boolean {
  return (
    schema === undefined ||
    (schema instanceof ZodType && schema.def.type === "object")
  );
}
