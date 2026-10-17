// ---
// relationships:
//   implements: command-line
// ---
import { dispatchHandler, type Follower } from "./run.ts";

export const threadStartHandler = (follower: () => Promise<Follower>) =>
  dispatchHandler("start", follower);
