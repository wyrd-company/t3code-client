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
        install: { method: string; label?: string; default?: boolean; command: string }[];
      }[];
    };
  };
};
const install = manifest.products.t3mcp.kinds[0]!.install;
const args = ["-y", "@wyrd-company/t3code-mcp", "--profile", "sample"];
// Hosts without a native wyrd.foo install method publish as a labelled `other`
// entry, so the tab is named after the host.
const host = (entry: { method: string; label?: string }) =>
  entry.method === "other" ? `other:${entry.label}` : entry.method;
const hosts = [
  "claude-code",
  "claude-desktop",
  "other:Codex",
  "cursor",
  "other:OpenCode",
  "other:Pi",
  "other:Antigravity",
  "json",
];

it("publishes every supported MCP host and retains the generic JSON fallback", () => {
  expect(manifest.products.t3mcp.kinds[0]!.kind).toBe("mcp-server");
  expect(install.map(host)).toEqual(hosts);
  expect(install.filter((entry) => entry.default).map(host)).toEqual(["claude-code"]);
  const page = readFileSync(new URL("t3mcp/getting-started.md", user), "utf8");
  const front = parse(page.match(/^---\n([\s\S]*?)\n---/u)![1]!) as { install: boolean };
  expect(front.install).toBe(true);
});

it("uses only the MCP install methods of the wyrd.foo@v2 publisher", () => {
  // Mirrors MCP_INSTALL_METHODS of wyrd.foo v2; another method fails publication.
  const accepted = ["claude-code", "claude-desktop", "cursor", "vscode", "json", "plugin", "other"];
  for (const entry of install) {
    expect(accepted).toContain(entry.method);
    if (entry.method === "other") expect(entry.label).toBeTruthy();
  }
});

for (const name of hosts) {
  it(`preserves the saved-profile stdio launch for ${name}`, () => {
    const entry = install.find((entry) => host(entry) === name)!;
    expect(entry).toBeDefined();
    if (name === "other:Codex") {
      expect(entry.command).toBe(
        '[mcp_servers.t3mcp]\ncommand = "npx"\nargs = ["-y", "@wyrd-company/t3code-mcp", "--profile", "sample"]',
      );
    } else if (name === "other:OpenCode") {
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
