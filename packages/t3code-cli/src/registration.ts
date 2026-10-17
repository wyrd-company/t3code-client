// ---
// relationships:
//   implements: cli-surface
// ---
import { Command, Option } from "commander";
import { T3PreconditionError } from "@wyrd-company/t3code-lib";
import { durationMs } from "./options.ts";

interface SurfaceOption {
  name: string;
  flags: string[];
  kind: string;
  description?: string;
  default?: string;
  required?: boolean;
  repeatable?: boolean;
  value?: { type: string; values?: string[] };
  "conflicts-with"?: string[];
}
interface SurfaceCommand {
  name: string;
  summary?: string;
  "positional-arguments"?: { name: string; required?: boolean }[];
  options?: SurfaceOption[];
  subcommands?: SurfaceCommand[];
}
export interface CommandSurface {
  "global-options": SurfaceOption[];
  commands: SurfaceCommand[];
}
export type CommandHandler = (args: readonly string[], command: Command) => Promise<void>;
export type CommandHandlers = Record<string, CommandHandler>;

/** Inject handlers by full command path; siblings do not replace the tree. */
export function registerCommands(
  surface: CommandSurface,
  handlers: CommandHandlers,
  version: string,
): Command {
  const root = new Command("t3c")
    .description("Drive stock T3 Code.")
    .version(`t3c ${version}`, "--version");
  root.showSuggestionAfterError(false).showHelpAfterError(false);
  for (const option of surface["global-options"])
    if (option.name !== "version") addOption(root, option);
  function register(parent: Command, commands: SurfaceCommand[], prefix: string) {
    for (const entry of commands) {
      const path = `${prefix}${entry.name}`;
      const command = parent.command(entry.name).description(entry.summary ?? entry.name);
      for (const argument of entry["positional-arguments"] ?? []) {
        command.argument(argument.required ? `<${argument.name}>` : `[${argument.name}]`);
      }
      for (const option of entry.options ?? []) addOption(command, option);
      if (entry.subcommands) register(command, entry.subcommands, `${path} `);
      else
        command.action(async (...values: unknown[]) => {
          const handler = handlers[path];
          if (!handler) throw new Error(`Command ${path} is not implemented.`);
          await handler(values.slice(0, -2) as string[], command);
        });
    }
  }
  register(root, surface.commands, "");
  return root;
}
function addOption(command: Command, entry: SurfaceOption): void {
  const option = new Option(
    `${entry.flags.join(", ")}${entry.kind === "flag" ? "" : ` <${entry.name}>`}`,
    entry.description ?? entry.name,
  );
  if (entry.default !== undefined) option.default(entry.default);
  if (entry.required) option.makeOptionMandatory();
  if (entry.value?.values) option.choices(entry.value.values);
  if (entry.value?.type === "duration")
    option.argParser((value) => {
      durationMs(value);
      return value;
    });
  if (entry.value?.type === "file" || entry.value?.type === "url")
    option.argParser((value) => {
      if (value.trim().length === 0)
        throw new T3PreconditionError("An explicit file or URL cannot be blank.");
      return value;
    });
  if (entry.repeatable) option.argParser((value, previous: string[] = []) => [...previous, value]);
  if (entry["conflicts-with"]) option.conflicts(entry["conflicts-with"].map(camelCase));
  command.addOption(option);
}
function camelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
