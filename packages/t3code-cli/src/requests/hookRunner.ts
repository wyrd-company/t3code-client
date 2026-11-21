// ---
// relationships:
//   implements: request-watch
// ---
import * as NodeChildProcess from "node:child_process";
import type { Readable } from "node:stream";
import { invocationDeadline } from "../execution/deadline.ts";

const groupPollMs = 100;
const signalGraceMs = 5_000;

export interface HookOptions {
  command: string;
  concurrency: number;
  timeout: string;
  timeoutMs: number;
}

interface HookInput {
  requestId: string;
  threadId: string;
  line: string;
}

type HookLog = (message: string, level?: "info" | "error") => void;

function requestContext(input: HookInput): string {
  return `${JSON.stringify(input.requestId)} in thread ${JSON.stringify(input.threadId)}`;
}

function forwardLines(stream: Readable, prefix: string, log: HookLog): () => void {
  let tail = "";
  stream.setEncoding("utf8").on("data", (chunk: string) => {
    const lines = (tail + chunk).split("\n");
    tail = lines.pop()!;
    for (const line of lines) log(prefix + line);
  });
  return () => {
    stream.destroy();
    if (tail) log(prefix + tail);
  };
}

class HookProcess {
  readonly input: HookInput;
  readonly #child: ReturnType<typeof NodeChildProcess.spawn>;
  readonly #group = process.platform !== "win32";
  readonly #cancelDeadline: () => void;
  readonly #flush: () => void;
  readonly #onDone: (failure?: string) => void;
  #poll: ReturnType<typeof setTimeout> | undefined;
  #escalation: ReturnType<typeof setTimeout> | undefined;
  #closed = false;
  #finished = false;
  #timeout: string | undefined;

  constructor(
    input: HookInput,
    options: HookOptions,
    serverOrigin: string,
    log: HookLog,
    onDone: (failure?: string) => void,
  ) {
    this.input = input;
    this.#onDone = onDone;
    const child = NodeChildProcess.spawn(options.command, {
      shell: true,
      detached: this.#group,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, T3_SERVER_URL: serverOrigin },
    });
    this.#child = child;
    const prefix = `t3c: hook ${JSON.stringify(input.requestId)}: `;
    const flushStdout = forwardLines(child.stdout, prefix, log);
    const flushStderr = forwardLines(child.stderr, prefix, log);
    this.#flush = () => {
      child.stdin.destroy();
      flushStdout();
      flushStderr();
    };
    child.stdin.on("error", () => {
      // The hook may exit without reading its input.
    });
    child.stdin.end(input.line);
    child.once("error", () => {
      if (child.pid === undefined) this.#finish("could not start");
    });
    child.once("exit", () => this.#observe());
    child.once("close", () => {
      this.#closed = true;
      this.#observe();
    });
    this.#cancelDeadline = invocationDeadline(Date.now(), options.timeoutMs, () =>
      this.#expire(options.timeout),
    );
  }

  #signal(signal: NodeJS.Signals | 0): boolean {
    const { pid, exitCode, signalCode } = this.#child;
    if (pid === undefined || (!this.#group && (exitCode !== null || signalCode !== null)))
      return false;
    try {
      return process.kill(this.#group ? -pid : pid, signal);
    } catch (error) {
      // ESRCH means the group is gone. A group we cannot signal still holds a slot
      // until the bounded timeout and escalation have elapsed.
      return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  }

  #observe(): void {
    if (this.#finished) return;
    clearTimeout(this.#poll);
    if (this.#signal(0)) {
      this.#poll = setTimeout(() => this.#observe(), groupPollMs);
    } else if (this.#closed || this.#timeout !== undefined) {
      this.#finish();
    }
  }

  #expire(timeout: string): void {
    if (!this.#signal(0)) {
      this.#finish();
      return;
    }
    this.#timeout = timeout;
    this.#signal("SIGTERM");
    this.#escalation = setTimeout(() => {
      if (this.#signal(0)) this.#signal("SIGKILL");
      // Signal 0 can keep finding an unreaped zombie after SIGKILL.
      this.#escalation = setTimeout(() => this.#finish(), signalGraceMs);
      this.#observe();
    }, signalGraceMs);
    this.#observe();
  }

  #finish(failure?: string): void {
    if (this.#finished) return;
    this.#clear();
    this.#flush();
    const { exitCode, signalCode } = this.#child;
    this.#onDone(
      failure ??
        (this.#timeout !== undefined
          ? `timed out after ${this.#timeout}`
          : signalCode !== null
            ? `signal ${signalCode}`
            : exitCode !== null && exitCode !== 0
              ? `exit ${exitCode}`
              : undefined),
    );
  }

  #clear(): void {
    this.#finished = true;
    this.#cancelDeadline();
    clearTimeout(this.#poll);
    clearTimeout(this.#escalation);
  }

  kill(): void {
    this.#signal("SIGKILL");
  }

  stop(): void {
    this.#clear();
    // A forced stop writes its outcome synchronously after every group is killed.
    this.#child.stdin?.destroy();
    this.#child.stdout?.destroy();
    this.#child.stderr?.destroy();
  }
}

export function emptyHookCounts() {
  return { succeeded: 0, failed: 0, stopped: 0, notRun: 0 };
}

export class HookRunner {
  readonly counts = emptyHookCounts();
  readonly #options: HookOptions;
  readonly #serverOrigin: string;
  readonly #log: HookLog;
  readonly #waiting: HookInput[] = [];
  readonly #active = new Set<HookProcess>();
  #notifyDrained: (() => void) | undefined;
  readonly #onExit = () => {
    for (const hook of this.#active) hook.kill();
  };

  constructor(options: HookOptions, serverOrigin: string, log: HookLog) {
    this.#options = options;
    this.#serverOrigin = serverOrigin;
    this.#log = log;
    process.on("exit", this.#onExit);
  }

  enqueue(input: HookInput): void {
    this.#waiting.push(input);
    this.#startWaiting();
  }

  #startWaiting(): void {
    while (this.#active.size < this.#options.concurrency) {
      const input = this.#waiting.shift();
      if (input === undefined) break;
      try {
        const hook = new HookProcess(
          input,
          this.#options,
          this.#serverOrigin,
          this.#log,
          (failure) => {
            this.#active.delete(hook);
            this.#report(input, failure);
            this.#startWaiting();
          },
        );
        this.#active.add(hook);
      } catch {
        this.#report(input, "could not start");
      }
    }
    if (this.#active.size === 0) this.#notifyDrained?.();
  }

  #report(input: HookInput, failure?: string): void {
    if (failure === undefined) {
      this.counts.succeeded++;
      this.#log(`t3c: hook finished for request ${JSON.stringify(input.requestId)}`, "info");
    } else {
      this.counts.failed++;
      this.#log(`t3c: hook failed for request ${requestContext(input)}: ${failure}`, "error");
    }
  }

  async drain(): Promise<void> {
    if (this.#active.size > 0) {
      await new Promise<void>((resolve) => {
        this.#notifyDrained = resolve;
      });
    }
    process.off("exit", this.#onExit);
  }

  forceStop(): string[] {
    // Signal every group before writing any diagnostic to a potentially closed pipe.
    this.#onExit();
    const messages: string[] = [];
    for (const hook of this.#active) {
      hook.stop();
      this.counts.stopped++;
      messages.push(`t3c: hook stopped for request ${requestContext(hook.input)}`);
    }
    this.#active.clear();
    for (const input of this.#waiting) {
      this.counts.notRun++;
      messages.push(`t3c: hook not run for request ${requestContext(input)}`);
    }
    this.#waiting.length = 0;
    this.#notifyDrained?.();
    process.off("exit", this.#onExit);
    return messages;
  }
}
