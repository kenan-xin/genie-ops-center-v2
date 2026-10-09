import type {
  AnySchema,
  ContractProcedureDef,
  ErrorMap,
  Meta,
} from "@orpc/contract";
import {
  getRouter,
  isProcedure,
  traverseContractProcedures,
} from "@orpc/server";
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
 * - a contract procedure the router does not resolve;
 * - decision 7: a procedure with no route, a path outside `/<moduleId>/`, or a `GET` whose input
 *   is not an object, because a `GET` carries its input in the query string.
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

  const problems: string[] = [];

  traverseContractProcedures(
    { router: contract, path: [] },
    ({ contract: procedure, path }) => {
      const name = path.join(".");

      if (!isProcedure(getRouter(router, path))) {
        problems.push(
          `Module "${moduleId}" declares procedure "${name}" that its router does not implement.`
        );
      }

      problems.push(...routeProblems(moduleId, name, procedure["~orpc"]));
    }
  );

  return problems;
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

  if (route.method === "GET" && !isQueryInput(inputSchema)) {
    problems.push(`${where} is a GET with an input that is not an object.`);
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
