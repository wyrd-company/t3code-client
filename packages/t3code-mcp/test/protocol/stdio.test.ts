// ---
// relationships:
//   verifies: mcp
// ---
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { expect, it } from "vite-plus/test";
import { toolNames } from "../../src/tools/index.ts";
import stock from "../fixtures/stockTools.json" with { type: "json" };

it("has no tool-name collisions with the complete pinned stock toolkit inventory", () => {
  expect(stock.tools.length).toBeGreaterThan(75);
  expect(toolNames.filter((name) => stock.tools.includes(name))).toEqual([]);
  expect(new Set(toolNames).size).toBe(toolNames.length);
  expect([...toolNames].sort()).toEqual(
    [
      "scheduled_task_endpoint",
      "scheduled_task_deliveries",
      "scheduled_task_delivery",
      "rotate_scheduled_task_webhook",
      "scheduled_task_configuration",
      "configure_scheduled_task",
      "thread_status",
      "thread_approvals",
      "thread_usage",
      "thread_diff",
      "thread_search_content",
      "provider_status",
      "usage_summary",
    ].sort(),
  );
});

it("initializes and lists tools through the built executable, then exits on pipe closure", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/cli.js", "serve"],
    stderr: "pipe",
  });
  let diagnostics = "";
  transport.stderr?.on("data", (chunk: Buffer) => {
    diagnostics += chunk.toString();
  });
  const client = new Client({ name: "sample-stdio-client", version: "1.0.0" });
  try {
    await client.connect(transport);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(toolNames);
  } finally {
    await client.close();
  }
  expect(diagnostics).toBe("");
});

it("lists tools without opening a server and withholds bad command argument text", async () => {
  const exec = promisify(execFile);
  expect(JSON.parse((await exec(process.execPath, ["dist/cli.js", "tools"])).stdout)).toEqual({
    tools: toolNames,
  });
  try {
    await exec(process.execPath, ["dist/cli.js", "--sample-private=value"]);
    throw new Error("Expected argument rejection");
  } catch (error) {
    expect(error).toMatchObject({ code: 2, stdout: "" });
    expect((error as { stderr: string }).stderr).not.toContain("sample-private");
  }
});
