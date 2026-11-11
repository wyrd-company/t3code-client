// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { makeShellThread } from "../../test/support/threadFixtures.ts";
import { AssetCreateUrlInput } from "./assets.ts";
import { ExecutionEnvironmentCapabilities } from "./environment.ts";
import { OrchestrationV2TurnCapabilities } from "./orchestration/providerCapabilities.ts";
import { OrchestrationV2PendingBackgroundTask } from "./orchestration/providerState.ts";
import { ThreadPullRequestWatch } from "./orchestration/pullRequest.ts";
import { OrchestrationV2ThreadShell } from "./orchestration/shell.ts";
import { ServerProviderResetCredits } from "./provider.ts";
import { ProviderConsumeResetCreditInput } from "./providerSetup.ts";
import {
  PullRequestCheck,
  PullRequestLabel,
  PullRequestThreadComment,
} from "./pullRequestParts.ts";
import { EnvironmentSpeechModel, EnvironmentSpeechModelLinkRequest } from "./speech.ts";

const at = "2026-01-01T00:00:00.000Z";

describe("field changes of 0.1.9", () => {
  it("reads the hosted approval capability and the native goal turn capability", () => {
    expect(ExecutionEnvironmentCapabilities.parse({ mcpHostedApproval: true })).toMatchObject({
      mcpHostedApproval: true,
    });
    const turn = {
      exposesNativeTurnId: true,
      emitsTurnStarted: true,
      emitsTurnCompleted: true,
      supportsInterrupt: true,
      supportsActiveSteering: true,
      supportsSteeringByInterruptRestart: false,
      supportsQueuedMessages: true,
      terminalStatusQuality: "strong",
    };
    expect(OrchestrationV2TurnCapabilities.parse(turn)).not.toHaveProperty("supportsNativeGoals");
    expect(
      OrchestrationV2TurnCapabilities.parse({ ...turn, supportsNativeGoals: true })
        .supportsNativeGoals,
    ).toBe(true);
  });

  it("reads where background work came from and a background wake on the shell", () => {
    const task = OrchestrationV2PendingBackgroundTask.parse({
      taskId: "task-1",
      kind: "monitor",
      command: "sample --watch",
      itemId: "item-1",
      sourceThreadId: "thread-2",
    });
    expect(task).toMatchObject({ command: "sample --watch", itemId: "item-1", kind: "monitor" });
    expect(task.sourceThreadId).toBe("thread-2");
    const thread = makeShellThread();
    expect(OrchestrationV2ThreadShell.parse(thread)).not.toHaveProperty("latestRunBackgroundWake");
    expect(
      OrchestrationV2ThreadShell.parse({ ...thread, latestRunBackgroundWake: true })
        .latestRunBackgroundWake,
    ).toBe(true);
  });

  it("lists reset credit options and redeems one by its id", () => {
    const option = {
      creditId: "credit-1",
      label: "Weekly reset",
      description: "Refills the weekly window.",
      availableCount: 1,
      expiresAt: at,
    };
    const credits = ServerProviderResetCredits.parse({ availableCount: 1, options: [option] });
    expect(credits.options).toEqual([option]);
    expect(ServerProviderResetCredits.parse({ availableCount: 0 })).not.toHaveProperty("options");
    expect(
      ProviderConsumeResetCreditInput.parse({ instanceId: "sample", creditId: "credit-1" }),
    ).toEqual({ instanceId: "sample", creditId: "credit-1" });
    expect(ProviderConsumeResetCreditInput.parse({ instanceId: "sample" })).toEqual({
      instanceId: "sample",
    });
    expect(
      ProviderConsumeResetCreditInput.safeParse({ instanceId: "sample", creditId: " " }).success,
    ).toBe(false);
  });

  it("reads label descriptions, placeholder checks and the review of a thread comment", () => {
    expect(
      PullRequestLabel.parse({ name: "sample", color: null, description: "A label." }).description,
    ).toBe("A label.");
    const check = { name: "awaiting", status: "pending", description: null, url: null };
    expect(PullRequestCheck.parse({ ...check, placeholder: true }).placeholder).toBe(true);
    const comment = {
      id: "comment-1",
      author: null,
      body: "Sample",
      createdAt: at,
      url: null,
      reviewUrl: "https://host.invalid/review/1",
    };
    expect(PullRequestThreadComment.parse(comment).reviewUrl).toBe("https://host.invalid/review/1");
    expect(PullRequestThreadComment.parse({ ...comment, reviewUrl: null }).reviewUrl).toBeNull();
  });

  it("reads checks that await approval on a watched pull request", () => {
    const watch = ThreadPullRequestWatch.parse({
      startedAt: at,
      headSha: "abc123",
      failedChecks: [],
      passed: false,
      awaitingApproval: ["https://host.invalid/run/1"],
      approvalAnnounced: true,
      remarksThrough: at,
      remarkIds: [],
      conflicting: false,
      wakes: 0,
    });
    expect(watch).toMatchObject({
      awaitingApproval: ["https://host.invalid/run/1"],
      approvalAnnounced: true,
    });
  });

  it("links a speech model from a path on the host", () => {
    expect(EnvironmentSpeechModelLinkRequest.parse({ path: "/sample/models" })).toEqual({
      path: "/sample/models",
    });
    expect(EnvironmentSpeechModelLinkRequest.safeParse({ path: " " }).success).toBe(false);
    expect(EnvironmentSpeechModelLinkRequest.safeParse({ path: "a".repeat(4097) }).success).toBe(
      false,
    );
    const model = EnvironmentSpeechModel.parse({
      id: "sample/model",
      name: "Sample",
      description: "A sample model.",
      size: 1000,
      languages: ["en"],
      accuracy: 0.9,
      speed: 0.8,
      recommended: false,
      supportsStreaming: false,
      supportsLanguageDetection: true,
      supportsTranslation: false,
      active: true,
      state: "installed",
      linkedFrom: "/sample/models/model.bin",
    });
    expect(model.linkedFrom).toBe("/sample/models/model.bin");
  });

  it("names a native app icon by its bundle path", () => {
    const resource = { _tag: "native-app-icon", app: { _tag: "app-path", path: "/sample/A.app" } };
    expect(AssetCreateUrlInput.parse({ resource })).toEqual({ resource });
    const empty = { _tag: "native-app-icon", app: { _tag: "app-path", path: " " } };
    expect(AssetCreateUrlInput.safeParse({ resource: empty }).success).toBe(false);
  });
});
