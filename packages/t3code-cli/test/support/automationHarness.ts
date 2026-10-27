// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import { vi } from "vite-plus/test";
import { T3Client } from "@wyrd-company/t3code-lib";
import { main, type InvocationHandler } from "../../src/main.ts";
import type { CommandSurface } from "../../src/registration.ts";

export const surface = JSON.parse(
  await NodeFSP.readFile(
    new URL("../../../../docs/specifications/cli-surface.json", import.meta.url),
    "utf8",
  ),
) as CommandSurface;

/** Runs t3c against a stubbed client; handlers stay the real automation handlers. */
export async function runWith(
  client: T3Client,
  handlers: Record<string, InvocationHandler>,
  args: string[],
  json = true,
) {
  const create = vi.spyOn(T3Client, "create").mockReturnValue(client);
  create.mockClear();
  vi.spyOn(client, "close").mockResolvedValue();
  const stdout: string[] = [],
    stderr: string[] = [];
  const code = await main(
    [...args, "--server", "http://127.0.0.1:1", ...(json ? ["--json"] : [])],
    surface,
    {
      stdout: (text) => {
        stdout.push(text);
      },
      stderr: (text) => {
        stderr.push(text);
      },
    },
    handlers,
  );
  return {
    code,
    connected: create.mock.calls.length > 0,
    stdout: stdout.join(""),
    stderr: stderr.join(""),
    result: json && stdout.length ? JSON.parse(stdout.join("")) : null,
  };
}

const descriptors = [
  {
    id: "speed",
    label: "Speed",
    type: "select",
    options: [
      { id: "fast", label: "Fast" },
      { id: "slow", label: "Slow" },
    ],
  },
  { id: "verbose", label: "Verbose", type: "boolean" },
];

/** A live-catalog provider with one default model offering two option descriptors. */
export const sampleProvider = {
  instanceId: "sample-provider",
  driver: "codex",
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-01-01T00:00:00.000Z",
  availability: "available",
  models: [
    {
      slug: "sample-model",
      name: "Sample model",
      isCustom: false,
      isDefault: true,
      capabilities: { optionDescriptors: descriptors },
    },
    { slug: "other-model", name: "Other model", isCustom: false, capabilities: null },
  ],
  slashCommands: [],
  skills: [],
  usageLimits: {
    checkedAt: "2026-01-01T00:00:00.000Z",
    windows: [{ id: "w1", kind: "session", label: "Session", usedPercent: 40 }],
  },
};
