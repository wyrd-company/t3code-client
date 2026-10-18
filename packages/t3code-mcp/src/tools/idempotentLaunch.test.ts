// ---
// relationships:
//   verifies: mcp
// ---
import { expect, it } from "vite-plus/test";
import { harness, model, shell } from "../../test/support/fakes.ts";
import { allTools } from "../server.ts";
const launch = allTools.find((t) => t.name === "thread_launch")!;
const input = {
  projectId: "project-1",
  modelSelection: model,
  clientRequestId: "sample-request",
  initialMessage: "Sample message",
};
it("returns existing threads without replaying the initial message", async () => {
  const h = harness();
  expect(await launch.run(input, h.context)).toMatchObject({ resumed: true });
  expect(h.threads.launch).not.toHaveBeenCalled();
});
it("serializes concurrent retries and launches exactly once", async () => {
  const h = harness();
  let created = false;
  h.threads.get.mockImplementation(async () => (created ? shell() : undefined));
  h.threads.launch.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    created = true;
    return {
      threadId: "thread-1",
      resumed: false,
      projection: (await h.threads.detail()).projection,
    };
  });
  const results = await Promise.all([launch.run(input, h.context), launch.run(input, h.context)]);
  expect(results).toMatchObject([{ resumed: false }, { resumed: true }]);
  expect(h.threads.launch).toHaveBeenCalledTimes(1);
});

it("recovers a persisted launch after a lost receipt without replaying", async () => {
  const h = harness();
  h.threads.get.mockResolvedValueOnce(undefined).mockResolvedValue(shell());
  h.threads.launch.mockRejectedValue(new Error("Sample lost receipt"));
  expect(await launch.run(input, h.context)).toMatchObject({ resumed: true });
  expect(h.threads.launch).toHaveBeenCalledTimes(1);
});
it("preserves launch failures when no thread was persisted", async () => {
  const h = harness();
  h.threads.get.mockResolvedValue(undefined);
  h.threads.launch.mockRejectedValue(new Error("Sample launch failure"));
  await expect(launch.run(input, h.context)).rejects.toThrow("Sample launch failure");
});
it("does not recover a cancelled launch", async () => {
  const h = harness();
  const controller = new AbortController();
  h.threads.get.mockResolvedValueOnce(undefined).mockResolvedValue(shell());
  h.threads.launch.mockImplementation(async () => {
    controller.abort();
    throw new Error("Sample cancellation");
  });
  await expect(launch.run(input, { ...h.context, signal: controller.signal })).rejects.toThrow(
    "Sample cancellation",
  );
  expect(h.threads.get).toHaveBeenCalledTimes(1);
});
