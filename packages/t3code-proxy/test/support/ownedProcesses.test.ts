// ---
// relationships:
//   verifies: proxy
// ---
import * as NodeChildProcess from "node:child_process";
import { expect, it } from "vite-plus/test";
import { ownedProcesses, stopAllOwned } from "./ownedProcesses.ts";

/** A child that reports when its handlers are in place. */
const start = (source: string) =>
  new Promise<NodeChildProcess.ChildProcess>((resolve) => {
    const child = NodeChildProcess.spawn(
      process.execPath,
      ["-e", `${source};setInterval(()=>{},1000);console.log("ready")`],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    child.stdout.once("data", () => resolve(child));
  });

it("kills a process that ignores SIGTERM, and still stops the others", async () => {
  const first = await start("");
  const stubborn = await start('process.on("SIGTERM",()=>{})');
  await stopAllOwned([first, stubborn], 200);
  expect(stubborn.signalCode).toBe("SIGKILL");
  expect(first.signalCode).toBe("SIGTERM");
});

it("does not kill a process that exits within the grace time", async () => {
  const child = await start('process.on("SIGTERM",()=>process.exit(0))');
  await stopAllOwned([child], 5_000);
  expect(child.exitCode).toBe(0);
});

it("ends and refuses a process that setup starts after the stop began", async () => {
  const owned = ownedProcesses(5_000);
  const early = owned.own(await start('process.on("SIGTERM",()=>process.exit(0))'));
  const late = await start('process.on("SIGTERM",()=>process.exit(0))');
  const lateExit = new Promise((resolve) => late.once("exit", resolve));
  const stopped = owned.stop();
  expect(() => owned.own(late)).toThrow("is stopping");
  await lateExit;
  await stopped;
  expect(early.exitCode).toBe(0);
  expect(late.exitCode).toBe(0);
});
