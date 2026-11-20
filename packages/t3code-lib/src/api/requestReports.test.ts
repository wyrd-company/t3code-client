// ---
// relationships:
//   verifies: request-watch
// ---
import { describe, expect, it } from "vite-plus/test";
import {
  items,
  makeAppThread,
  makeProjection,
  makeRuntimeRequest,
} from "../../test/support/threadFixtures.ts";
import { threadId } from "../schemas/common.ts";
import { checkFilters } from "./requestIndex.ts";
import { requestKey, RequestReports } from "./requestReports.ts";

const thread = threadId("thread-1");
const later = "2020-01-01T00:00:01.000Z";
const title = () => "Sample project";
const view = (requests: Record<string, unknown>[], cards: Record<string, unknown>[] = []) =>
  makeProjection({ runtimeRequests: requests, turnItems: cards });

describe("RequestReports", () => {
  it("reports a request once, with its card, oldest first, and the thread and project", () => {
    const reports = new RequestReports();
    const filters = checkFilters({});
    const first = view(
      [makeRuntimeRequest("request-2", { createdAt: later }), makeRuntimeRequest("request-1")],
      [items.approvalRequest("request-2"), items.approvalRequest("request-1")],
    );
    const { seen, ready } = reports.read(thread, first, filters);
    expect(seen.map((entry) => entry.requestId)).toEqual(["request-1", "request-2"]);
    expect(ready.map((entry) => entry.requestId)).toEqual(["request-1", "request-2"]);
    const reported = reports.finish(ready[0]!.key, first, filters, title);
    expect(reported).toMatchObject({
      kind: "approval",
      requestId: "request-1",
      item: { requestId: "request-1" },
      thread: { id: "thread-1", title: "Sample thread", tags: [] },
      project: { id: "project-1", title: "Sample project" },
    });
    expect(reports.finish(ready[0]!.key, first, filters, title)).toBeUndefined();
    expect(reports.read(thread, first, filters).seen).toEqual([]);
    expect(reports.waiting(thread)).toBe(true);
    reports.finish(ready[1]!.key, first, filters, title);
    expect(reports.waiting(thread)).toBe(false);
  });

  it("waits for a card, then reports the settled status the view holds", () => {
    const reports = new RequestReports();
    const filters = checkFilters({});
    const { seen, ready } = reports.read(thread, view([makeRuntimeRequest("request-1")]), filters);
    expect(seen).toHaveLength(1);
    expect(ready).toEqual([]);
    const settled = view([makeRuntimeRequest("request-1", { status: "resolved" })]);
    expect(reports.read(thread, settled, filters)).toEqual({ seen: [], ready: [] });
    const reported = reports.finish(requestKey(thread, "request-1"), settled, filters, title);
    expect(reported?.request.status).toBe("resolved");
    expect(reported?.item).toBeUndefined();
  });

  it("keeps the last record when a view no longer holds the request", () => {
    const reports = new RequestReports();
    const filters = checkFilters({});
    reports.read(thread, view([makeRuntimeRequest("request-1")]), filters);
    const reported = reports.finish(requestKey(thread, "request-1"), view([]), filters, title);
    expect(reported?.request.status).toBe("pending");
  });

  it("drops a request its latest thread record no longer selects, and sees it again", () => {
    const reports = new RequestReports();
    const filters = checkFilters({ excludeTags: ["reviewer"] });
    const pending = view([makeRuntimeRequest("request-1")]);
    reports.read(thread, pending, filters);
    const tagged = makeProjection({
      thread: makeAppThread({ tags: ["reviewer"] }),
      runtimeRequests: [makeRuntimeRequest("request-1")],
    });
    expect(reports.read(thread, tagged, filters).seen).toEqual([]);
    expect(reports.finish(requestKey(thread, "request-1"), tagged, filters, title)).toBeUndefined();
    expect(reports.read(thread, tagged, filters).seen).toEqual([]);
    expect(reports.read(thread, pending, filters).seen).toHaveLength(1);
  });

  it("never sees settled requests or requests of another kind", () => {
    const reports = new RequestReports();
    const history = view(
      [
        makeRuntimeRequest("request-1", { status: "resolved" }),
        makeRuntimeRequest("request-2", { status: "expired" }),
        makeRuntimeRequest("request-3", { kind: "user_input" }),
      ],
      [items.userInputRequest("request-3")],
    );
    expect(reports.read(thread, history, checkFilters({ kind: "approval" }))).toEqual({
      seen: [],
      ready: [],
    });
    const { ready } = reports.read(thread, history, checkFilters({ kind: "user-input" }));
    expect(ready.map((entry) => entry.last)).toMatchObject([
      { kind: "user-input", questions: [{ id: "q1" }] },
    ]);
  });
});
