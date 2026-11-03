// ---
// relationships:
//   verifies: proxy
// ---
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { main } from "./cliMain.ts";

let directory: string;
beforeEach(() => {
  directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-proxy-cli-"));
});
afterEach(() => NodeFS.rmSync(directory, { recursive: true, force: true }));

function io(stop: Promise<unknown> = Promise.resolve()) {
  const output = { out: "", err: "" };
  return {
    output,
    io: {
      out: (text: string) => void (output.out += text),
      err: (text: string) => void (output.err += text),
      stop,
    },
  };
}
const flags = ["--upstream", "http://127.0.0.1:1"];

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = NodeNet.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as NodeNet.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

describe("main", () => {
  it("--list-users prints each port, a tab and name, and does not listen", async () => {
    const port = await freePort();
    const held = NodeNet.createServer();
    await new Promise<void>((resolve) => held.listen(port, "127.0.0.1", () => resolve()));
    try {
      const { output, io: streams } = io(new Promise(() => undefined));
      const code = await main(
        [...flags, "--user", `Alice Example=${port}`, "--user", "Sam=4102", "--list-users"],
        streams,
      );
      expect(code).toBe(0);
      expect(output.out).toBe(`${port}\tAlice Example\n4102\tSam\n`);
      expect(output.err).toBe("");
    } finally {
      held.close();
    }
  });
  it("--list-users validates the config", async () => {
    const { output, io: streams } = io();
    expect(await main(["--list-users", ...flags], streams)).toBe(1);
    expect(output.out).toBe("");
    expect(output.err).toContain("at least one person");
  });
  it("--list-users reads the config file", async () => {
    const path = NodePath.join(directory, "config.yml");
    NodeFS.writeFileSync(
      path,
      "upstream: http://127.0.0.1:1\nusers:\n  - name: Alice\n    port: 4101\n",
    );
    const { output, io: streams } = io();
    expect(await main(["--config", path, "--list-users"], streams)).toBe(0);
    expect(output.out).toBe("4101\tAlice\n");
  });
  it("--version prints the package version", async () => {
    const { output, io: streams } = io();
    expect(await main(["--version"], streams)).toBe(0);
    const manifest = JSON.parse(
      NodeFS.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(output.out).toBe(`${manifest.version}\n`);
  });
  it("--help prints the usage", async () => {
    const { output, io: streams } = io();
    expect(await main(["--help"], streams)).toBe(0);
    for (const flag of ["--config", "--upstream", "--host", "--user", "--list-users"]) {
      expect(output.out).toContain(flag);
    }
  });
  it("an unknown flag stops with exit 1", async () => {
    const { output, io: streams } = io();
    expect(await main(["--unknown"], streams)).toBe(1);
    expect(output.err).toContain("--unknown");
  });
  it("a positional argument stops with exit 1", async () => {
    const { io: streams } = io();
    expect(await main(["extra"], streams)).toBe(1);
  });
  it("an invalid config stops before it listens", async () => {
    const port = await freePort();
    const { io: streams, output } = io(new Promise(() => undefined));
    expect(await main(["--upstream", "ftp://a", "--user", `Alice=${port}`], streams)).toBe(1);
    expect(output.err).toContain("upstream must be");
    expect(output.err).not.toContain("listening");
  });
  it("a port in use stops with exit 1", async () => {
    const port = await freePort();
    const held = NodeNet.createServer();
    await new Promise<void>((resolve) => held.listen(port, "127.0.0.1", () => resolve()));
    try {
      const { output, io: streams } = io(new Promise(() => undefined));
      expect(await main([...flags, "--user", `Alice=${port}`], streams)).toBe(1);
      expect(output.err).toContain("EADDRINUSE");
    } finally {
      held.close();
    }
  });
  it("serves until it must stop, and then closes the listeners", async () => {
    const port = await freePort();
    let stop!: () => void;
    const { output, io: streams } = io(new Promise<void>((resolve) => (stop = resolve)));
    const running = main([...flags, "--user", `Alice=${port}`], streams);
    await expect.poll(() => output.err).toContain("Alice listening");
    const status = await new Promise<number>((resolve, reject) => {
      NodeHttp.get(`http://127.0.0.1:${port}/`, (answer) => {
        answer.resume();
        resolve(answer.statusCode ?? 0);
      }).on("error", reject);
    });
    expect(status).toBe(502);
    stop();
    expect(await running).toBe(0);
    await expect(
      new Promise((resolve, reject) => {
        const socket = NodeNet.connect(port, "127.0.0.1", () => resolve(socket.destroy()));
        socket.on("error", reject);
      }),
    ).rejects.toMatchObject({ code: "ECONNREFUSED" });
  });
});
