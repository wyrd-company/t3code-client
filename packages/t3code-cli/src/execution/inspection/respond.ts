// ---
// relationships:
//   implements: command-contract
// ---
import {
  T3PreconditionError,
  runtimeRequestId,
  threadId,
  type ProviderUserInputAnswers,
} from "@wyrd-company/t3code-lib";
import type { InvocationHandler } from "../../main.ts";

export const respond: InvocationHandler = async ([id], command, invocation) => {
  const options = command.optsWithGlobals();
  const answers = options["answer"] as string[] | undefined;
  const accept = options["accept"] === true;
  const reject = options["reject"] === true;
  const request = options["request"] as string | undefined;
  if (!request?.trim() || Number(answers !== undefined) + Number(accept) + Number(reject) !== 1)
    throw new T3PreconditionError("Supply one response kind and a request id.");
  const keyed: ProviderUserInputAnswers = Object.create(null);
  for (const answer of answers ?? []) {
    const separator = answer.indexOf("=");
    if (separator < 1 || !answer.slice(0, separator).trim())
      throw new T3PreconditionError("Answers must use question-id=value.");
    keyed[answer.slice(0, separator)] = answer.slice(separator + 1);
  }
  const client = await invocation.client();
  invocation.errorContext = "dispatch";
  const input = { threadId: threadId(id!), requestId: runtimeRequestId(request) };
  if (answers !== undefined) await client.threads.respondToUserInput({ ...input, answers: keyed });
  else
    await client.threads.respondToApproval({ ...input, decision: accept ? "accept" : "decline" });
  invocation.output.finish(
    { data: { threadId: id, requestId: request }, exitCode: 0 },
    `Response sent: ${id}\t${request}`,
  );
};
