// ---
// relationships:
//   verifies: proxy
// ---
import { expect, it } from "vite-plus/test";
import {
  BROWSER_STOPPING,
  runInOwnGroup,
  sendBrowserCommand,
  startBrowserBroker,
} from "./browserBroker.ts";

it("returns the output of a command, and the error of a failed one", async () => {
  const broker = await startBrowserBroker(async ([first]) => {
    if (first === "fail") throw new Error("sample failure");
    return `ran ${first}`;
  });
  await expect(sendBrowserCommand(broker.url, ["sample"])).resolves.toBe("ran sample");
  await expect(sendBrowserCommand(broker.url, ["fail"])).rejects.toThrow("sample failure");
  broker.close();
});

it("drains only after a running command ends, and refuses a new one from the start", async () => {
  let finish = (_output: string) => {};
  let started = 0;
  const broker = await startBrowserBroker(() => {
    started += 1;
    return new Promise((resolve) => (finish = resolve));
  });
  const running = sendBrowserCommand(broker.url, ["slow"]);
  await expect.poll(() => started).toBe(1);

  let drained = false;
  const drain = broker.drain().then(() => (drained = true));
  await expect(sendBrowserCommand(broker.url, ["late"])).rejects.toThrow(BROWSER_STOPPING);
  expect(started).toBe(1);
  expect(drained).toBe(false);

  finish("done");
  await expect(running).resolves.toBe("done");
  await drain;
  expect(drained).toBe(true);
  broker.close();
});

it("runs a command as the leader of its own process group", async () => {
  const output = await runInOwnGroup("sh", ["-c", "echo $$; ps -o pgid= -p $$"], 10_000);
  const [pid, group] = output.trim().split(/\s+/u);
  expect(group).toBe(pid);
});

it("rejects when a command fails", async () => {
  await expect(runInOwnGroup("sh", ["-c", "echo sample >&2; exit 3"], 10_000)).rejects.toThrow(
    "ended with 3: sample",
  );
});
