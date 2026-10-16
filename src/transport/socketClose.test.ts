import { describe, expect, it } from "vite-plus/test";
import { closeError } from "./socketClose.ts";

describe("closeError", () => {
  it("treats a 4xx upgrade and close 1008 as fatal", () => {
    expect(closeError({ code: 1006, reason: "", upgradeStatus: 401 }, false)).toMatchObject({
      fatal: true,
      error: { reason: "open_failed" },
    });
    expect(closeError({ code: 1008, reason: "policy" }, true).fatal).toBe(true);
  });

  it("names an oversized message and still reconnects", () => {
    expect(closeError({ code: 1006, reason: "", messageTooLarge: true }, true)).toMatchObject({
      fatal: false,
      error: { reason: "message_too_large" },
    });
  });

  it("reports other drops as closed or open_failed", () => {
    expect(closeError({ code: 1006, reason: "" }, true).error.reason).toBe("closed");
    expect(closeError({ code: 1006, reason: "" }, false).error.reason).toBe("open_failed");
  });
});
