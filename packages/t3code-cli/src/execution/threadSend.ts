// ---
// relationships:
//   implements: command-line
// ---
import { dispatchHandler, type Follower } from "./run.ts";

export const threadSendHandler = (follower: () => Promise<Follower>) =>
  dispatchHandler("send", follower);
