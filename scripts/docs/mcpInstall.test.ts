// ---
// relationships:
//   verifies: documentation
// ---
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { expect, it } from "vite-plus/test";

const user = new URL("../../docs/user/", import.meta.url);
const manifest = parse(readFileSync(new URL("docs.yml", user), "utf8")) as {
  products: {
    t3mcp: {
      kinds: {
        kind: string;
        install: { method: string; default?: boolean; command: string }[];
      }[];
    };
  };
};
const install = manifest.products.t3mcp.kinds[0]!.install;
const args = ["-y", "@wyrd-company/t3code-mcp", "--profile", "sample"];
const methods = [
  "claude-code",
  "claude-desktop",
  "codex",
  "cursor",
  "opencode",
  "pi",
  "antigravity",
  "json",
];

it("publishes every supported MCP host and retains the generic JSON fallback", () => {
  expect(manifest.products.t3mcp.kinds[0]!.kind).toBe("mcp-server");
  expect(install.map((entry) => entry.method)).toEqual(methods);
  expect(install.filter((entry) => entry.default).map((entry) => entry.method)).toEqual([
    "claude-code",
  ]);
  const page = readFileSync(new URL("t3mcp/getting-started.md", user), "utf8");
  const front = parse(page.match(/^---\n([\s\S]*?)\n---/u)![1]!) as { install: boolean };
  expect(front.install).toBe(true);
});

for (const method of methods) {
  it(`preserves the saved-profile stdio launch for ${method}`, () => {
    const entry = install.find((entry) => entry.method === method)!;
    expect(entry).toBeDefined();
    if (method === "codex") {
      expect(entry.command).toBe(
        '[mcp_servers.t3mcp]\ncommand = "npx"\nargs = ["-y", "@wyrd-company/t3code-mcp", "--profile", "sample"]',
      );
    } else if (method === "opencode") {
      expect(JSON.parse(entry.command)).toEqual({
        mcp: { t3mcp: { type: "local", command: ["npx", ...args], enabled: true } },
      });
    } else {
      expect(JSON.parse(entry.command)).toEqual({
        mcpServers: { t3mcp: { command: "npx", args } },
      });
    }
  });
}
