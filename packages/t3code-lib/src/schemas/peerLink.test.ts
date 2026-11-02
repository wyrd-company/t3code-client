// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, it } from "vite-plus/test";
import { ids, makeAppThread, makeShellThread } from "../../test/support/threadFixtures.ts";
import { ExecutionEnvironmentCapabilities } from "./environment.ts";
import { OrchestrationV2AppThread } from "./orchestration/thread.ts";
import { PeerLinkCreateInput, PeerLinkRequestAnswerInput, PeerLinkSummary } from "./peerLink.ts";

const linkOrigin = { sessionId: "session-1", label: "Sample peer", access: "read-only" };
const delegatedFrom = {
  environmentId: "environment-peer",
  threadId: "thread-parent",
  title: "Sample parent",
};

describe("peer link schemas", () => {
  it("requires an access level the server accepts on input", () => {
    const input = { url: "https://peer.example.test", pairingCode: "sample" };
    for (const access of ["read-only", "approval-required", "auto-accept-edits", "auto"]) {
      expect(PeerLinkCreateInput.safeParse({ ...input, access }).success).toBe(true);
    }
    expect(PeerLinkCreateInput.safeParse({ ...input, access: "full-access" }).success).toBe(true);
    expect(PeerLinkCreateInput.safeParse({ ...input, access: "future" }).success).toBe(false);
    expect(PeerLinkCreateInput.safeParse({ ...input }).success).toBe(false);
    expect(
      PeerLinkCreateInput.safeParse({ ...input, access: "auto", pairingCode: "  " }).success,
    ).toBe(false);
  });

  it("rejects an answer of an unknown type", () => {
    const base = { threadId: ids.threadId, turnItemId: ids.itemId };
    expect(
      PeerLinkRequestAnswerInput.safeParse({ ...base, answer: { type: "decline" } }).success,
    ).toBe(true);
    expect(
      PeerLinkRequestAnswerInput.safeParse({ ...base, answer: { type: "later" } }).success,
    ).toBe(false);
    expect(
      PeerLinkRequestAnswerInput.safeParse({ ...base, answer: { type: "use-existing" } }).success,
    ).toBe(false);
  });

  it("requires the status of a listed link", () => {
    expect(
      PeerLinkSummary.safeParse({
        environmentId: "environment-peer",
        label: "Sample peer",
        urls: [],
        access: "auto",
        linkedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-02-01T00:00:00.000Z",
        lastReachedAt: null,
        lastError: null,
      }).success,
    ).toBe(false);
  });

  it("keeps the link origin and the delegating thread on thread rows", () => {
    const fields = { linkOrigin, delegatedFrom };
    expect(OrchestrationV2AppThread.parse(makeAppThread(fields))).toMatchObject(fields);
    expect(makeShellThread(fields)).toMatchObject(fields);
    const { linkOrigin: omitted } = makeShellThread({
      linkOrigin: { sessionId: "session-1", label: "Sample peer" },
    });
    expect(omitted).toEqual({ sessionId: "session-1", label: "Sample peer" });
    expect(makeShellThread().linkOrigin).toBeUndefined();
    expect(() => makeShellThread({ linkOrigin: { label: "Sample peer" } })).toThrow();
    expect(() => makeShellThread({ delegatedFrom: { title: "Sample parent" } })).toThrow();
  });

  it.each(["peerLinks", "mcpModeLimitHeader", "linkFence"])(
    "preserves omission and booleans and rejects other values for %s",
    (flag) => {
      expect(ExecutionEnvironmentCapabilities.parse({})).not.toHaveProperty(flag);
      for (const value of [true, false]) {
        expect(ExecutionEnvironmentCapabilities.parse({ [flag]: value })).toMatchObject({
          [flag]: value,
        });
      }
      expect(ExecutionEnvironmentCapabilities.safeParse({ [flag]: "true" }).success).toBe(false);
    },
  );
});
