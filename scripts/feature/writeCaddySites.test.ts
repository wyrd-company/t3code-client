// ---
// relationships:
//   verifies: proxy
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

const script = new URL("../../features/src/t3code-proxy/write-caddy-sites", import.meta.url)
  .pathname;
const roots: string[] = [];

function setup(options: { server?: string | null; service?: boolean } = {}) {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "write-caddy-sites-"));
  roots.push(root);
  const caddy = NodePath.join(root, "caddy");
  NodeFS.mkdirSync(NodePath.join(caddy, "conf.d"), { recursive: true });
  NodeFS.mkdirSync(NodePath.join(caddy, "required-hosts.d"));
  const service = NodePath.join(root, "t3code-server");
  if (options.service !== false) NodeFS.mkdirSync(service);
  const server = options.server === undefined ? "t3.dev.example.test\n" : options.server;
  if (server !== null) {
    NodeFS.writeFileSync(NodePath.join(caddy, "required-hosts.d/t3code-server.host"), server);
  }
  return {
    caddy,
    run: (users: string) =>
      NodeChildProcess.spawnSync(script, [service, caddy], { input: users, encoding: "utf8" }),
    sites: () => NodePath.join(caddy, "conf.d/t3code-proxy.caddy"),
    hosts: () => NodePath.join(caddy, "required-hosts.d/t3code-proxy.host"),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

describe("write-caddy-sites", () => {
  it("writes one site and one required host for each person", () => {
    const { run, sites, hosts } = setup();
    const result = run("4101\tAlice\n4102\tSam\n");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(NodeFS.readFileSync(sites(), "utf8")).toBe(
      "t3-alice.dev.example.test {\n    reverse_proxy 127.0.0.1:4101\n}\n" +
        "t3-sam.dev.example.test {\n    reverse_proxy 127.0.0.1:4102\n}\n",
    );
    expect(NodeFS.readFileSync(hosts(), "utf8")).toBe(
      "t3-alice.dev.example.test\nt3-sam.dev.example.test\n",
    );
    expect(NodeFS.statSync(sites()).mode & 0o777).toBe(0o644);
    expect(NodeFS.statSync(hosts()).mode & 0o777).toBe(0o644);
  });

  it("replaces the files at each start, so that a removed person loses their site", () => {
    const { run, sites, hosts } = setup();
    run("4101\tAlice\n4102\tSam\n");
    expect(run("4101\tAlice\n").status).toBe(0);
    expect(NodeFS.readFileSync(sites(), "utf8")).not.toContain("t3-sam");
    expect(NodeFS.readFileSync(hosts(), "utf8")).not.toContain("t3-sam");
  });

  it("leaves no temporary file", () => {
    const { run, caddy } = setup();
    run("4101\tAlice\n");
    expect(NodeFS.readdirSync(NodePath.join(caddy, "conf.d"))).toEqual(["t3code-proxy.caddy"]);
    expect(NodeFS.readdirSync(NodePath.join(caddy, "required-hosts.d")).sort()).toEqual([
      "t3code-proxy.host",
      "t3code-server.host",
    ]);
  });

  it.each([
    ["no server service", { service: false }],
    ["no host file", { server: null }],
    ["an empty host file", { server: "" }],
  ])("writes no file with %s", (_name, options) => {
    const { run, sites, hosts } = setup(options);
    expect(run("4101\tAlice\n").status).toBe(0);
    expect(NodeFS.existsSync(sites())).toBe(false);
    expect(NodeFS.existsSync(hosts())).toBe(false);
  });

  it.each([
    ["a name with a space", "4101\tAlice Smith\n", "'Alice Smith' does not make a valid DNS label"],
    ["a name with a dot", "4101\tal.ice\n", "'al.ice' does not make a valid DNS label"],
    ["a name with a brace", "4101\tal}ice\n", "'al}ice' does not make a valid DNS label"],
    ["a name that ends with a hyphen", "4101\talice-\n", "does not make a valid DNS label"],
    ["a name over the label limit", `4101\t${"a".repeat(61)}\n`, "does not make a valid DNS label"],
    ["names that make one label", "4101\tAlice\n4102\talice\n", "'Alice' and 'alice'"],
  ])("fails with %s and writes no file", (_name, users, message) => {
    const { run, sites, hosts } = setup();
    const result = run(users);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(NodeFS.existsSync(sites())).toBe(false);
    expect(NodeFS.existsSync(hosts())).toBe(false);
  });

  it("fails with a server hostname that has no parent domain", () => {
    const { run } = setup({ server: "t3\n" });
    const result = run("4101\tAlice\n");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no parent domain");
  });

  it("fails when a hostname is over the DNS limit", () => {
    const parent = Array.from({ length: 5 }, () => "b".repeat(50)).join(".");
    const { run } = setup({ server: `t3.${parent}\n` });
    const result = run("4101\tAlice\n");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("253-character");
  });
});
