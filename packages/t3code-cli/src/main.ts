// ---
// relationships:
//   implements: command-line
// ---
import { CommanderError } from "commander";
import { createInvocation, type Invocation } from "./context.ts";
import { exitCodeFor, failureFor, UnimplementedCommandError } from "./errors.ts";
import { checkNode } from "./options.ts";
import { emptyExecution, Output, type OutputSink } from "./output.ts";
import { registerCommands, type CommandHandlers, type CommandSurface } from "./registration.ts";
import { packageVersions, reportVersion } from "./version.ts";

export type InvocationHandler = (
  args: readonly string[],
  command: import("commander").Command,
  invocation: Invocation,
) => Promise<void>;

export async function main(
  argv: string[],
  surface: CommandSurface,
  sink: OutputSink,
  handlers: Record<string, InvocationHandler> = {},
): Promise<number> {
  let invocation: Invocation | undefined;
  let output = new Output(sink, argv.includes("--json"));
  let execution = false;
  const startedAt = Date.now();
  try {
    try {
      checkNode(process.versions.node);
    } catch {
      output.finish({
        data: null,
        exitCode: 2,
        error: { code: "node_version", message: "t3c requires Node >=22.16." },
      });
      return 2;
    }
    const versions = await packageVersions();
    const paths = Object.keys(handlers);
    const wrapped: CommandHandlers = {};
    const root = registerCommands(surface, wrapped, versions.cli);
    root.exitOverride().configureOutput({ writeOut: sink.stdout, writeErr: () => {} });
    root.hook("preSubcommand", (_, selected) => {
      if (selected.name() === "run") execution = true;
    });
    function install(commands: typeof root.commands, prefix = "") {
      for (const command of commands) {
        command.exitOverride().configureOutput({ writeOut: sink.stdout, writeErr: () => {} });
        const path = `${prefix}${command.name()}`;
        if (path === "thread")
          command.hook("preSubcommand", (_, selected) => {
            execution =
              selected.name() === "send" ||
              selected.name() === "wait" ||
              (selected.name() === "start" && argv.includes("--wait"));
          });
        if (!command.commands.length && path !== "version" && !paths.includes(path))
          command.description(`${command.description()} [implementation pending]`);
        if (command.commands.length) install(command.commands, `${path} `);
        else
          wrapped[path] = async (args, selected) => {
            const options = selected.optsWithGlobals();
            output = new Output(sink, options["json"] === true, options["stream"] === true);
            invocation = createInvocation(options, output, undefined, versions.cli);
            execution =
              path === "run" ||
              path === "thread send" ||
              path === "thread wait" ||
              (path === "thread start" && options["wait"] === true);
            if (path === "version") await reportVersion(invocation);
            else if (paths.includes(path)) await handlers[path]!(args, selected, invocation);
            else throw new UnimplementedCommandError();
          };
      }
    }
    install(root.commands);
    await root.parseAsync(argv, { from: "user" });
    return output.exitCode;
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return 0;
    const context = invocation?.errorContext ?? "local";
    const exitCode = error instanceof CommanderError ? 2 : exitCodeFor(error, context);
    const failure = failureFor(error, context);
    if (error instanceof CommanderError) {
      failure.code = "usage";
      failure.message = "Invalid command or option. Use --help.";
    }
    if (execution)
      output.finish({ ...emptyExecution(Date.now() - startedAt), exitCode, error: failure });
    else output.finish({ data: null, exitCode, error: failure });
    return exitCode;
  } finally {
    await invocation?.close();
  }
}
