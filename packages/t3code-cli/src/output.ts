// ---
// relationships:
//   implements: command-line
// ---
import * as NodeFS from "node:fs";
import type { CliFailure, ExitCode } from "./errors.ts";

const logLevels = ["silent", "error", "warn", "info", "debug"];

export function logEnabled(level: string, threshold = "warn"): boolean {
  return logLevels.indexOf(level) <= logLevels.indexOf(threshold);
}

export interface OutputSink {
  stdout(text: string): void;
  stderr(text: string): void;
}
export interface ExecutionResult {
  threadId: string | null;
  runId: string | null;
  state: string;
  /** Mode sent by this invocation; null when no mode was sent. */
  runtimeMode?: string | null;
  assistantMessage: string | null;
  pendingRequests: readonly unknown[];
  exitCode: ExitCode;
  durationMs: number;
  error?: CliFailure;
}
export interface InspectionResult {
  data: unknown;
  exitCode: ExitCode;
  error?: CliFailure;
}

function writeForced(fd: 1 | 2, text: string): void {
  try {
    NodeFS.writeSync(fd, text);
  } catch {
    // A closed output stream must not prevent the other writes or the forced exit.
  }
}

/** One invocation owns one output instance, and finishes it once. */
export class Output {
  #finished = false;
  #streamed = false;
  readonly sink: OutputSink;
  readonly json: boolean;
  readonly stream: boolean;
  exitCode: ExitCode = 0;
  constructor(sink: OutputSink, json = false, stream = false) {
    this.sink = sink;
    this.json = json;
    this.stream = stream;
  }

  progress(message: string): void {
    if (this.#finished) return;
    this.sink.stderr(`${message}\n`);
  }
  line(line: string): void {
    if (!this.#finished) this.sink.stdout(line);
  }
  delta(text: string): void {
    if (!this.stream || this.#finished) return;
    this.#streamed = true;
    if (this.json) this.event({ type: "assistantDelta", text });
    else this.sink.stdout(text);
  }
  event(event: unknown): void {
    if (this.stream && this.json && !this.#finished) this.sink.stdout(`${JSON.stringify(event)}\n`);
  }
  finish(result: ExecutionResult | InspectionResult, text = ""): void {
    this.#finish(result, text, this.sink);
  }
  finishForced(result: InspectionResult, diagnostics: readonly string[]): void {
    if (this.#finished) return;
    for (const message of diagnostics) writeForced(2, `${message}\n`);
    this.#finish(result, "", {
      stdout: (text) => writeForced(1, text),
      stderr: (text) => writeForced(2, text),
    });
  }
  #finish(result: ExecutionResult | InspectionResult, text: string, sink: OutputSink): void {
    if (this.#finished) throw new Error("Output already finished.");
    if (this.json) {
      sink.stdout(`${JSON.stringify(this.stream ? { type: "result", ...result } : result)}\n`);
    } else if ("assistantMessage" in result) {
      if (!this.#streamed && result.assistantMessage !== null)
        sink.stdout(`${result.assistantMessage}\n`);
      else if (this.#streamed) sink.stdout("\n");
    } else if (text) sink.stdout(`${text}\n`);
    if (result.error) sink.stderr(`t3c: ${result.error.message}\n`);
    this.exitCode = result.exitCode;
    this.#finished = true;
  }
}

export function emptyExecution(durationMs: number): ExecutionResult {
  return {
    threadId: null,
    runId: null,
    state: "unknown",
    assistantMessage: null,
    pendingRequests: [],
    exitCode: 0,
    durationMs,
  };
}
