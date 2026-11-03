// ---
// relationships:
//   verifies: proxy
// ---
/** One person's real browser, through `agent-browser`. The proof's setup sets its environment. */
import * as NodeChildProcess from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(NodeChildProcess.execFile);

export class WebClient {
  readonly #session: string;

  constructor(person: string) {
    this.#session = `proof-${person}`;
  }

  async run(...args: string[]) {
    const { stdout } = await execFile(
      "agent-browser",
      ["--session", this.#session, "--ignore-https-errors"]
        // The certificate is a test certificate, and every example.test name is this machine.
        .concat(["--args", "--host-resolver-rules=MAP *.example.test 127.0.0.1"], args),
      { maxBuffer: 16 * 1024 * 1024, timeout: 60_000 },
    );
    return stdout.trim();
  }

  async text() {
    return this.run("get", "text", "body");
  }

  async url() {
    return new URL(await this.run("get", "url"));
  }

  /** The reference of the first interactive element whose snapshot line matches. */
  async ref(pattern: RegExp) {
    const snapshot = await this.run("snapshot", "-i");
    const line = snapshot.split("\n").find((candidate) => pattern.test(candidate));
    const found = line && /ref=(e\d+)/u.exec(line);
    if (!found) throw new Error(`No element matches ${pattern}.`);
    return `@${found[1]}`;
  }

  async click(pattern: RegExp) {
    await this.run("click", await this.ref(pattern));
  }

  async close() {
    await this.run("close").catch(() => undefined);
  }
}
