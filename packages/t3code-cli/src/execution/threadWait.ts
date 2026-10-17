// ---
// relationships:
//   implements: command-line
// ---
import { T3PreconditionError } from "@wyrd-company/t3code-lib";
import type { InvocationHandler } from "../main.ts";
import { followRun, followPolicy } from "./follow.ts";

export const threadWait: InvocationHandler = async (args, command, invocation) => {
  const id = args[0];
  if (!id) throw new T3PreconditionError("Thread id required.");
  const policy = followPolicy(command.optsWithGlobals(), "detach");
  invocation.output.finish(await followRun(invocation, { threadId: id }, policy));
};
