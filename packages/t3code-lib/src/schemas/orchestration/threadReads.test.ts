// ---
// relationships:
//   verifies: library-wire
// ---
/** The 0.1.8 thread title, link metadata, prompt suggestion and branch reads. */
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { rpcMethods, type RpcMethods } from "../../rpc/registry.ts";
import type { RpcPayload, RpcSuccess } from "../../rpc/spec.ts";
import { ServerConfig } from "../server.ts";
import { VcsBranchStatus } from "../vcs.ts";
import {
  OrchestrationV2GetThreadTitlesInput,
  OrchestrationV2PromptSuggestion,
  OrchestrationV2SubscribePromptSuggestionInput,
  OrchestrationV2ThreadLinkMetadataMap,
  OrchestrationV2ThreadTitles,
} from "./threadReads.ts";

describe("orchestration.getThreadTitles and getThreadLinkMetadata", () => {
  it("are orchestration:read calls that take thread ids", () => {
    for (const method of [
      "orchestration.getThreadTitles",
      "orchestration.getThreadLinkMetadata",
    ] as const) {
      expect(rpcMethods[method]).toMatchObject({ stream: false, scope: "orchestration:read" });
    }
    expectTypeOf<RpcPayload<RpcMethods, "orchestration.getThreadLinkMetadata">>().toEqualTypeOf<
      RpcPayload<RpcMethods, "orchestration.getThreadTitles">
    >();
    expect(OrchestrationV2GetThreadTitlesInput.parse({ threadIds: [] })).toEqual({
      threadIds: [],
    });
    for (const threadIds of [undefined, "thread-1", [""], [1]]) {
      expect(OrchestrationV2GetThreadTitlesInput.safeParse({ threadIds }).success).toBe(false);
    }
  });

  it("reads titles and link metadata keyed by thread id", () => {
    expect(OrchestrationV2ThreadTitles.parse({ "thread-1": "Sample", "thread-2": "" })).toEqual({
      "thread-1": "Sample",
      "thread-2": "",
    });
    expect(OrchestrationV2ThreadTitles.safeParse({ "thread-1": null }).success).toBe(false);
    const metadata = {
      "thread-1": { title: "Sample", projectId: "project-1" },
      "thread-2": { title: "Other", projectId: null },
    };
    expect(OrchestrationV2ThreadLinkMetadataMap.parse(metadata)).toEqual(metadata);
    for (const entry of [{ title: "Sample" }, { title: 1, projectId: null }]) {
      expect(OrchestrationV2ThreadLinkMetadataMap.safeParse({ "thread-1": entry }).success).toBe(
        false,
      );
    }
    expectTypeOf<
      RpcSuccess<RpcMethods, "orchestration.getThreadTitles">
    >().toEqualTypeOf<OrchestrationV2ThreadTitles>();
  });

  it("reads the threadLinkMetadata config flag as optional", () => {
    const shape = ServerConfig.shape.threadLinkMetadata;
    expect(shape.parse(undefined)).toBeUndefined();
    expect(shape.parse(true)).toBe(true);
    expect(shape.safeParse("true").success).toBe(false);
  });
});

describe("orchestration.subscribePromptSuggestion", () => {
  it("is an orchestration:read stream of a suggestion or null", () => {
    expect(rpcMethods["orchestration.subscribePromptSuggestion"]).toMatchObject({
      stream: true,
      scope: "orchestration:read",
    });
    expect(OrchestrationV2SubscribePromptSuggestionInput.safeParse({}).success).toBe(false);
    expect(OrchestrationV2PromptSuggestion.parse(null)).toBeNull();
    const suggestion = { runId: "run-1", text: "Run the tests." };
    expect(OrchestrationV2PromptSuggestion.parse(suggestion)).toEqual(suggestion);
    for (const value of [undefined, { runId: "run-1" }, { runId: "", text: "x" }]) {
      expect(OrchestrationV2PromptSuggestion.safeParse(value).success).toBe(false);
    }
  });
});

describe("subscribeVcsBranch and vcs.refreshBranch", () => {
  it("are orchestration:read methods that take a cwd", () => {
    expect(rpcMethods.subscribeVcsBranch).toMatchObject({
      stream: true,
      scope: "orchestration:read",
    });
    expect(rpcMethods["vcs.refreshBranch"]).toMatchObject({
      stream: false,
      scope: "orchestration:read",
    });
    expectTypeOf<RpcSuccess<RpcMethods, "vcs.refreshBranch">>().toEqualTypeOf<void>();
    expectTypeOf<RpcPayload<RpcMethods, "subscribeVcsBranch">>().toEqualTypeOf<{
      [key: string]: unknown;
      cwd: string;
    }>();
  });

  it("reads a branch name or null", () => {
    expect(VcsBranchStatus.parse({ refName: "main" })).toEqual({ refName: "main" });
    expect(VcsBranchStatus.parse({ refName: null })).toEqual({ refName: null });
    expect(VcsBranchStatus.safeParse({}).success).toBe(false);
  });
});
