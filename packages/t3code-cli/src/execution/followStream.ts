// ---
// relationships:
//   implements: output-contract
// ---
import { isTurnItemOfType, type ThreadWatchItem } from "@wyrd-company/t3code-lib";
import type { Output } from "../output.ts";

/** Snapshots can contain text from before subscription or from a reconnect. */
export class FollowStream {
  readonly output: Output;
  readonly text = new Map<string, string>();
  constructor(output: Output) {
    this.output = output;
  }

  observe(item: ThreadWatchItem, runId: string | null): void {
    if (!this.output.stream || runId === null) return;
    if (item.kind === "snapshot") {
      for (const row of item.snapshot.projection.turnItems)
        if (isTurnItemOfType(row, "assistant_message") && row.runId === runId)
          this.append(row.messageId, row.text);
    } else if (item.kind === "assistant-delta" && item.runId === runId)
      this.append(item.messageId, item.text);
  }

  append(messageId: string, text: string): void {
    const previous = this.text.get(messageId) ?? "";
    if (previous.startsWith(text)) return;
    this.text.set(messageId, text);
    this.output.delta(text.startsWith(previous) ? text.slice(previous.length) : text);
  }
}
