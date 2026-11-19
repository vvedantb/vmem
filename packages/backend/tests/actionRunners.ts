import type { TestConvex } from "convex-test";
import {
  getFunctionName,
  makeFunctionReference,
  type FunctionArgs,
  type FunctionReturnType,
} from "convex/server";
import type { ActionCtx } from "../convex/_generated/server";
import type schema from "../convex/schema";

// `t.query` and `t.mutation` take a plain FunctionReference only. Production
// code can also pass the newer reference kind, so each call goes through a
// plain reference to the same function name.
export function actionRunners(
  t: TestConvex<typeof schema>,
): Pick<ActionCtx, "runQuery" | "runMutation"> {
  return {
    runQuery: (query, ...args) =>
      t.query(
        makeFunctionReference<
          "query",
          FunctionArgs<typeof query>,
          FunctionReturnType<typeof query>
        >(getFunctionName(query)),
        args[0],
      ),
    runMutation: (mutation, ...args) =>
      t.mutation(
        makeFunctionReference<
          "mutation",
          FunctionArgs<typeof mutation>,
          FunctionReturnType<typeof mutation>
        >(getFunctionName(mutation)),
        args[0],
      ),
  };
}
