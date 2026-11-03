// ---
// relationships:
//   verifies: proxy
// ---
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { ConfigError, resolveConfig } from "./config.ts";

let directory: string;
beforeEach(() => {
  directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-proxy-config-"));
});
afterEach(() => NodeFS.rmSync(directory, { recursive: true, force: true }));

const file = (content: string) => {
  const path = NodePath.join(directory, "config.yml");
  NodeFS.writeFileSync(path, content);
  return path;
};
const valid = `upstream: http://127.0.0.1:3773
host: 10.0.0.1
users:
  - name: Alice
    port: 4101
  - name: Sam
    port: 4102
`;
const flags = { upstream: "http://127.0.0.1:3773", user: ["Alice=4101"] };
const fails = (input: Parameters<typeof resolveConfig>[0], message: RegExp | string) => {
  expect(() => resolveConfig(input)).toThrow(ConfigError);
  expect(() => resolveConfig(input)).toThrow(message);
};

describe("resolveConfig", () => {
  it("reads the file", () => {
    const config = resolveConfig({ config: file(valid) });
    expect(config.upstream.href).toBe("http://127.0.0.1:3773/");
    expect(config.host).toBe("10.0.0.1");
    expect(config.users).toEqual([
      { name: "Alice", port: 4101 },
      { name: "Sam", port: 4102 },
    ]);
  });
  it("uses only flags", () => {
    expect(resolveConfig(flags)).toMatchObject({
      host: "127.0.0.1",
      users: [{ name: "Alice", port: 4101 }],
    });
  });
  it("uses 127.0.0.1 when the file gives no host", () => {
    const path = file("upstream: http://127.0.0.1:3773\nusers: [{ name: Alice, port: 4101 }]\n");
    expect(resolveConfig({ config: path }).host).toBe("127.0.0.1");
  });
  it("lets a flag replace the upstream and host in the file", () => {
    const config = resolveConfig({
      config: file(valid),
      upstream: "https://server.example.test",
      host: "10.0.0.2",
    });
    expect(config.upstream.href).toBe("https://server.example.test/");
    expect(config.host).toBe("10.0.0.2");
    expect(config.users).toHaveLength(2);
  });
  it("lets any --user replace the full users list", () => {
    const config = resolveConfig({ config: file(valid), user: ["Pat=4200"] });
    expect(config.users).toEqual([{ name: "Pat", port: 4200 }]);
  });
  it("lets flags complete a partial file", () => {
    const config = resolveConfig({ config: file("host: 10.0.0.3\n"), ...flags });
    expect(config.host).toBe("10.0.0.3");
  });
  it("splits --user at the last equals sign", () => {
    expect(resolveConfig({ ...flags, user: ["A=B=4101"] }).users).toEqual([
      { name: "A=B", port: 4101 },
    ]);
  });
  it("accepts a name with spaces", () => {
    expect(resolveConfig({ ...flags, user: ["Alice Example=4101"] }).users[0]?.name).toBe(
      "Alice Example",
    );
  });
});

describe("invalid values stop the service", () => {
  it.each([
    ["an unknown key", `${valid}extra: 1\n`, /extra/u],
    ["an unknown user key", "users: [{ name: A, port: 1, extra: 1 }]\n", /extra/u],
    ["an empty name", "users: [{ name: '', port: 4101 }]\n", /users/u],
    ["a blank name", "users: [{ name: '  ', port: 4101 }]\n", /users/u],
    ["a name on two lines", 'users: [{ name: "A\\nB", port: 4101 }]\n', /users/u],
    ["a name with a line separator", 'users: [{ name: "A\\LB", port: 4101 }]\n', /users/u],
    ["a port of zero", "users: [{ name: A, port: 0 }]\n", /users/u],
    ["a port too large", "users: [{ name: A, port: 65536 }]\n", /users/u],
    ["a fractional port", "users: [{ name: A, port: 1.5 }]\n", /users/u],
    ["a port as text", "users: [{ name: A, port: '4101' }]\n", /users/u],
    ["an upstream that is not text", "upstream: 1\n", /upstream/u],
    ["an empty host", "host: ''\n", /host/u],
    ["a document that is not a mapping", "- a\n", /invalid/u],
    ["an empty document", "", /invalid/u],
  ])("%s in the file", (_name, content, message) => {
    fails({ config: file(content), ...flags }, message);
  });
  it("invalid YAML", () => fails({ config: file("a: [") }, "not valid YAML"));
  it("a missing file", () => {
    fails({ config: NodePath.join(directory, "absent.yml") }, /Cannot read.*ENOENT/u);
  });
  it("a name that occurs twice", () => {
    fails({ ...flags, user: ["Alice=4101", "Alice=4102"] }, "name must occur only once");
  });
  it("a port that occurs twice", () => {
    fails({ ...flags, user: ["Alice=4101", "Sam=4101"] }, "port must occur only once");
  });
  it("a duplicate in the file", () => {
    const content = `upstream: http://127.0.0.1:3773
users:
  - { name: Alice, port: 4101 }
  - { name: Alice, port: 4102 }
`;
    fails({ config: file(content) }, "name must occur only once");
  });
  it("no people", () => fails({ upstream: flags.upstream }, "at least one person"));
  it("an empty users list", () => {
    fails({ config: file("users: []\n"), upstream: flags.upstream }, "at least one person");
  });
  it("no upstream", () => fails({ user: flags.user }, "server URL"));
  it("an empty --host", () => fails({ ...flags, host: "" }, "--host"));
  it.each([
    "Alice",
    "=4101",
    "Alice=",
    "Alice=abc",
    "Alice=0",
    "Alice=70000",
    "Alice=1.5",
    " =4101",
  ])("the --user value %j", (user) => fails({ ...flags, user: [user] }, "--user"));
  it.each([
    "not a url",
    "ftp://127.0.0.1",
    "http://user:pass@127.0.0.1",
    "http://user@127.0.0.1",
    "http://127.0.0.1/path",
    "http://127.0.0.1/?a=1",
    "http://127.0.0.1/#a",
  ])("the upstream %j", (upstream) => fails({ ...flags, upstream }, "upstream must be"));
});
