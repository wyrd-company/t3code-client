// ---
// relationships:
//   verifies: mcp
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeAssert from "node:assert/strict";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { Client } from "@modelcontextprotocol/client";
import { z } from "zod";
import { ResponseValidator } from "../vendor/mcp-server-tester/responseValidator.ts";
import type { TestCase } from "../vendor/mcp-server-tester/types.ts";
export const caseSchema = z.object({
  name: z.string(),
  flags: z.array(z.string()).default([]),
  expectedTools: z.array(z.string()).optional(),
  calls: z
    .array(
      z.object({
        name: z.string(),
        args: z.record(z.string(), z.unknown()).default({}),
        status: z.enum(["success", "error"]),
        code: z.string().optional(),
      }),
    )
    .default([]),
});
export type ProtocolCase = z.infer<typeof caseSchema>;
export async function readCases(): Promise<ProtocolCase[]> {
  const dir = new URL("./cases/", import.meta.url);
  return Promise.all(
    (await NodeFSP.readdir(dir))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map(async (name) =>
        caseSchema.parse(JSON.parse(await NodeFSP.readFile(new URL(name, dir), "utf8"))),
      ),
  );
}
/** Reusable with an already-connected stdio client, including the live pair. */
export async function runCase(client: Client, spec: ProtocolCase): Promise<void> {
  NodeAssert.equal(client.getServerVersion()?.name, "t3code-mcp");
  NodeAssert.match(client.getServerVersion()!.version, /^\d+\.\d+\.\d+$/);
  NodeAssert.match(
    client.getInstructions() ?? "",
    /server_list.*server_capabilities.*thread_launch.*thread_wait/,
  );
  const tools = (await client.listTools()).tools;
  if (spec.expectedTools)
    NodeAssert.deepEqual(tools.map((t) => t.name).sort(), [...spec.expectedTools].sort());
  const ajv = new Ajv2020({ strict: false, validateFormats: false });
  for (const tool of tools) {
    NodeAssert.equal(tool.inputSchema.type, "object");
    ajv.compile(tool.inputSchema);
  }
  for (const c of spec.calls) {
    const definition = tools.find((t) => t.name === c.name);
    NodeAssert.ok(definition, `Case refers to an unexposed tool: ${c.name}`);
    const validInput = ajv.compile(definition.inputSchema)(c.args);
    const result = await client.callTool({ name: c.name, arguments: c.args });
    // SDK validation failures are MCP error results; their text follows the SDK contract.
    if (!validInput) {
      NodeAssert.equal(result.isError, true);
      continue;
    }
    const value = result.structuredContent as Record<string, unknown> | undefined;
    NodeAssert.ok(value, "Tool result requires structuredContent");
    NodeAssert.deepEqual(
      JSON.parse((result.content as { type: string; text: string }[])[0]!.text),
      value,
    );
    const test: TestCase = {
      id: spec.name,
      toolName: c.name,
      description: spec.name,
      naturalLanguageQuery: "",
      inputs: c.args,
      expectedOutcome: {
        status: c.status,
        ...(c.code === undefined
          ? {}
          : {
              validationRules: [
                {
                  type: "equals",
                  target: "error.code",
                  value: c.code,
                  message: "Unexpected error code",
                },
              ],
            }),
      },
    };
    const failure = value["error"] as { code?: string; message: string } | undefined;
    const response = {
      status: result.isError ? ("error" as const) : ("success" as const),
      data: value,
      ...(failure === undefined ? {} : { error: failure }),
    };
    const verdict = new ResponseValidator().validateResponse(response, test);
    NodeAssert.equal(verdict.valid, true, `${spec.name}/${c.name}: ${verdict.errors.join(", ")}`);
  }
}
