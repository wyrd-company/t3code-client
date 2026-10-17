// ---
// relationships:
//   verifies: command-line
// ---
import { expect, it } from "vite-plus/test";
import {
  agent,
  cli,
  ownedThreads,
  record,
  runCommand,
  useDispatchHarness,
} from "./dispatchHarness.ts";

useDispatchHarness("stream");
it.skipIf(!agent)(
  "streams real assistant text once and NDJSON deltas followed by one result",
  async () => {
    for (const json of [false, true]) {
      const result = await cli([
        ...runCommand,
        "Reply SAMPLE only.",
        "--stream",
        ...(json ? ["--json"] : []),
      ]);
      expect(result.exit).toBe(0);
      const id = /Thread: ([^\n]+)/.exec(result.stderr)![1]!;
      ownedThreads.add(id);
      if (json) {
        const events = result.stdout
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        const final = events.filter((event) => event.type === "result");
        expect(final).toHaveLength(1);
        expect(events.at(-1)).toBe(final[0]);
        expect(final[0]).toMatchObject({
          threadId: id,
          state: "completed",
          exitCode: 0,
          assistantMessage: "SAMPLE",
        });
        const deltas = events.filter((event) => event.type === "assistantDelta");
        expect(deltas.length).toBeGreaterThan(0);
        expect(deltas.map((event) => event.text).join("")).toBe("SAMPLE");
      } else expect(result.stdout).toBe("SAMPLE\n");
      record({ case: "stream", json, threadId: id, ...result });
    }
  },
);
