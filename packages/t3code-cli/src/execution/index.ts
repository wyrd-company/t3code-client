// ---
// relationships:
//   implements: command-line
// ---
import type { InvocationHandler } from "../main.ts";
import { inspectionHandlers } from "./inspection/index.ts";
import { threadWait } from "./threadWait.ts";
import { followRun } from "./follow.ts";
import { followPolicy } from "./followPolicy.ts";
import { dispatchHandler, type Follower } from "./run.ts";
import { threadStartHandler } from "./threadStart.ts";
import { threadSendHandler } from "./threadSend.ts";

const follower = async (): Promise<Follower> => ({ followRun, followPolicy });

/** Run, thread, project and server handlers keyed by full command path. */
export const executionHandlers: Record<string, InvocationHandler> = {
  ...inspectionHandlers,
  "thread wait": threadWait,
  run: dispatchHandler("run", follower),
  "thread start": threadStartHandler(follower),
  "thread send": threadSendHandler(follower),
};
