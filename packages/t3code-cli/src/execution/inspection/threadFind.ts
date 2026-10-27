// ---
// relationships:
//   implements: command-line
// ---
import { schemas, T3PreconditionError } from "@wyrd-company/t3code-lib";
import type { InvocationHandler } from "../../main.ts";

export const threadFind: InvocationHandler = async (_, command, invocation) => {
  const options = command.optsWithGlobals();
  const provider = schemas.common.ProviderInstanceId.safeParse(options["provider"]);
  const session = schemas.common.TrimmedNonEmptyString.safeParse(options["session"]);
  if (!provider.success || !session.success) {
    throw new T3PreconditionError(
      "A valid provider instance id and nonempty native session id are required.",
    );
  }
  const client = await invocation.client();
  const data = await client.threads.findByNativeSession(provider.data, session.data);
  invocation.output.finish({ data, exitCode: 0 }, data ?? "null");
};
