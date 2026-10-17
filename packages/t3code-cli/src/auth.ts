// ---
// relationships:
//   implements: command-line
//   references: profiles
// ---
import type { InvocationHandler } from "./main.ts";
import { pairInput } from "./authInput.ts";
import { authStatus } from "./authStatus.ts";

export const authHandlers: Record<string, InvocationHandler> = {
  "auth pair": async (args, command, invocation) => {
    const input = await pairInput(args[0], command.optsWithGlobals());
    invocation.errorContext = "connection";
    const profile = input.session
      ? await invocation.profiles.setAccessToken(input, input.token)
      : await invocation.profiles.pair(input, input.token);
    invocation.output.finish(
      { data: profile, exitCode: 0 },
      `Paired ${profile.name} (${profile.url}).`,
    );
  },
  "auth status": async (_args, _command, invocation) => authStatus(invocation),
  "auth switch": async (args, _command, invocation) => {
    await invocation.profiles.switch(args[0]!);
    invocation.output.finish({ data: { current: args[0] }, exitCode: 0 }, `Current: ${args[0]}`);
  },
  "auth logout": async (args, _command, invocation) => {
    const name = args[0] ?? (await invocation.profiles.getCurrent())?.name;
    await invocation.profiles.logout(args[0]);
    invocation.output.finish({ data: { removed: name }, exitCode: 0 }, `Removed: ${name}`);
  },
};
