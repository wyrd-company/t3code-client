import { describe, expect, it } from "vite-plus/test";
import { T3ConnectionError, T3InterruptedError } from "../errors.ts";
import { shouldResubscribe } from "./watchRetry.ts";

const tooLarge = new T3ConnectionError("message_too_large", "too large");
const dropped = new T3ConnectionError("closed", "dropped");

describe("shouldResubscribe", () => {
  it("resubscribes after a drop while the transport reconnects", () => {
    expect(shouldResubscribe(dropped, "connecting", false)).toBe(true);
    expect(shouldResubscribe(dropped, "open", false)).toBe(false);
    expect(shouldResubscribe(dropped, "closed", true)).toBe(false);
    expect(shouldResubscribe(new T3InterruptedError("stop"), "connecting", false)).toBe(false);
  });

  it("stops on an oversized message only when the subscription delivered nothing", () => {
    expect(shouldResubscribe(tooLarge, "connecting", false)).toBe(false);
    expect(shouldResubscribe(tooLarge, "connecting", true)).toBe(true);
  });
});
