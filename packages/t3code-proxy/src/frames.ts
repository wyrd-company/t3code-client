// ---
// relationships:
//   implements: proxy
// ---
import { withByline, withoutByline } from "./byline.ts";

const DISPATCH = "orchestration.dispatchCommand";
const LAUNCH = "orchestration.launchThread";

export interface FrameRewrite {
  /** The new frame text, or undefined when no request changed. */
  readonly text: string | undefined;
  /** The RPC tag and command type of each request in the rewrite table. They hold no message text. */
  readonly commands: readonly string[];
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface Identity {
  readonly name: string;
  readonly names: readonly string[];
}

/** Replaces the field and returns whether its value changed. */
function replaceText(target: Json, next: (text: string) => string): boolean {
  const text = target["text"];
  if (typeof text !== "string") return false;
  const changed = next(text);
  target["text"] = changed;
  return changed !== text;
}

function rewriteRequest(envelope: unknown, identity: Identity, commands: string[]): boolean {
  if (!isObject(envelope) || envelope["_tag"] !== "Request") return false;
  const payload = envelope["payload"];
  if (!isObject(payload)) return false;
  const { name, names } = identity;
  if (envelope["tag"] === DISPATCH && typeof payload["text"] === "string") {
    if (payload["type"] === "queued-run.edit") {
      commands.push(`${DISPATCH} queued-run.edit`);
      return replaceText(payload, (text) => withByline(withoutByline(text, names), name));
    }
    if (payload["type"] === "message.dispatch") {
      commands.push(`${DISPATCH} message.dispatch`);
      // The server uses the guest's text and adds its own attribution.
      if (payload["guestMessageId"] !== undefined) return false;
      return replaceText(payload, (text) => withByline(text, name));
    }
    return false;
  }
  if (envelope["tag"] === LAUNCH && isObject(payload["initialMessage"])) {
    if (typeof payload["initialMessage"]["text"] !== "string") return false;
    commands.push(LAUNCH);
    return replaceText(payload["initialMessage"], (text) => withByline(text, name));
  }
  return false;
}

/** Stamps the byline on the client requests that carry message text. */
export function rewriteFrame(frame: string, identity: Identity): FrameRewrite {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frame);
  } catch {
    return { text: undefined, commands: [] };
  }
  const commands: string[] = [];
  const envelopes: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  let changed = false;
  for (const envelope of envelopes) {
    if (rewriteRequest(envelope, identity, commands)) changed = true;
  }
  return { text: changed ? JSON.stringify(parsed) : undefined, commands };
}
