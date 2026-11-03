// ---
// relationships:
//   verifies: proxy
// ---
/** One person's real browser, through `agent-browser`. The proof's setup runs its commands. */
import { sendBrowserCommand } from "../support/browserBroker.ts";

export class WebClient {
  readonly #session: string;

  constructor(person: string) {
    this.#session = `proof-${person}`;
  }

  async run(...args: string[]) {
    const output = await sendBrowserCommand(
      process.env["T3_PROOF_BROWSER_BROKER"] as string,
      ["--session", this.#session, "--ignore-https-errors"]
        // The certificate is a test certificate, and every example.test name is this machine.
        .concat(["--args", "--host-resolver-rules=MAP *.example.test 127.0.0.1"], args),
    );
    return output.trim();
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
