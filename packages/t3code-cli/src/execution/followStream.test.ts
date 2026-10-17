// ---
// relationships:
//   verifies: output-contract
// ---
import { expect, it } from "vite-plus/test";
import {
  makeProjection,
  makeSnapshot,
  items,
  ids,
} from "../../../t3code-lib/test/support/threadFixtures.ts";
import { FollowStream } from "./followStream.ts";
import { Output } from "../output.ts";

it("streams a snapshot prefix once and deduplicates replayed assistant text", () => {
  const stdout: string[] = [];
  const output = new Output({ stdout: (s) => stdout.push(s), stderr: () => {} }, false, true);
  const stream = new FollowStream(output);
  function snapshot(text: string, runId = ids.runId) {
    stream.observe(
      {
        kind: "snapshot",
        snapshot: makeSnapshot(
          makeProjection({ turnItems: [items.assistantMessage(text, true, { runId })] }),
          1,
        ),
      },
      ids.runId,
    );
  }
  snapshot("Hel");
  snapshot("Hello");
  snapshot("Hello");
  snapshot("Hel");
  snapshot("Hello!");
  snapshot("unrelated", "other" as typeof ids.runId);
  expect(stdout.join("")).toBe("Hello!");
});
