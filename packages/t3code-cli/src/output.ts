// ---
// relationships:
//   implements: output-contract
// ---
import type { CliFailure, ExitCode } from "./errors.ts";

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
    if (this.#finished) throw new Error("Output already finished.");
    if (this.json) {
      this.sink.stdout(`${JSON.stringify(this.stream ? { type: "result", ...result } : result)}\n`);
    } else if ("assistantMessage" in result) {
      if (!this.#streamed && result.assistantMessage !== null)
        this.sink.stdout(`${result.assistantMessage}\n`);
      else if (this.#streamed) this.sink.stdout("\n");
    } else if (text) this.sink.stdout(`${text}\n`);
    if (result.error) this.sink.stderr(`t3c: ${result.error.message}\n`);
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
