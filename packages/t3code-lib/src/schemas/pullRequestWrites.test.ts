// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import {
  PullRequestActionInput,
  PullRequestCommentInput,
  PullRequestCommentUpdateInput,
  PullRequestInvalidateInput,
  PullRequestLabelChangeInput,
  PullRequestReactionInput,
  PullRequestReportStateInput,
  PullRequestReviewerRequestInput,
  PullRequestSetFilesViewedInput,
  PullRequestSubmitReviewInput,
  PullRequestUpdateInput,
} from "./pullRequestWrites.ts";

describe("pull request write inputs", () => {
  const ref = { projectId: "project-1", repository: "sample/repository", number: 7 };

  it("takes only the contract's values in a field that a result leaves open", () => {
    const action = { ...ref, action: "merge" };
    expect(PullRequestActionInput.safeParse(action).success).toBe(true);
    expect(PullRequestActionInput.safeParse({ ...ref, action: "sample" }).success).toBe(false);
    expect(PullRequestActionInput.safeParse({ ...action, mergeMethod: "sample" }).success).toBe(
      false,
    );
    expect(PullRequestActionInput.safeParse({ ...action, updateMethod: "squash" }).success).toBe(
      false,
    );
    const reaction = { ...ref, reacted: true };
    expect(PullRequestReactionInput.safeParse({ ...reaction, content: "eyes" }).success).toBe(true);
    expect(PullRequestReactionInput.safeParse({ ...reaction, content: "sample" }).success).toBe(
      false,
    );
    const review = { ...ref, body: "", comments: [] };
    expect(PullRequestSubmitReviewInput.safeParse({ ...review, verdict: "approve" }).success).toBe(
      true,
    );
    expect(PullRequestSubmitReviewInput.safeParse({ ...review, verdict: "sample" }).success).toBe(
      false,
    );
    expect(PullRequestReportStateInput.safeParse({ reference: ref, state: "all" }).success).toBe(
      false,
    );
    expect(
      PullRequestCommentUpdateInput.safeParse({
        ...ref,
        commentId: "1",
        kind: "review",
        body: "Sample",
      }).success,
    ).toBe(false);
  });

  it("keeps the whitespace of a body and bounds it", () => {
    const body = " Sample\n";
    expect(PullRequestCommentInput.parse({ ...ref, body }).body).toBe(body);
    expect(PullRequestCommentInput.safeParse({ ...ref, body: "" }).success).toBe(false);
    expect(PullRequestCommentInput.safeParse({ ...ref, body: "x".repeat(65_537) }).success).toBe(
      false,
    );
    expect(PullRequestUpdateInput.safeParse({ ...ref, body: "" }).success).toBe(true);
    expect(PullRequestUpdateInput.safeParse({ ...ref, title: "" }).success).toBe(false);
    expect(PullRequestUpdateInput.safeParse({ ...ref, title: "x".repeat(1025) }).success).toBe(
      false,
    );
  });

  it("requires the fields of each kind of review position", () => {
    const parse = (position: unknown) =>
      PullRequestSubmitReviewInput.safeParse({
        ...ref,
        verdict: "comment",
        body: "",
        comments: [{ path: "sample.txt", position, body: "Sample" }],
      }).success;
    expect(parse({ kind: "added", newLine: 1 })).toBe(true);
    expect(parse({ kind: "deleted", oldLine: 1 })).toBe(true);
    expect(parse({ kind: "context", oldLine: 1, newLine: 2, side: "left" })).toBe(true);
    expect(parse({ kind: "added", oldLine: 1 })).toBe(false);
    expect(parse({ kind: "context", oldLine: 1, newLine: 2 })).toBe(false);
    expect(parse({ kind: "sample", newLine: 1 })).toBe(false);
  });

  it("bounds the lists", () => {
    const files = (length: number) =>
      Array.from({ length }, () => ({ path: "sample.txt", viewed: true }));
    expect(PullRequestSetFilesViewedInput.safeParse({ ...ref, files: files(500) }).success).toBe(
      true,
    );
    expect(PullRequestSetFilesViewedInput.safeParse({ ...ref, files: files(501) }).success).toBe(
      false,
    );
    const reviewers = (length: number) => Array.from({ length }, () => ({ id: "1", kind: "user" }));
    const request = { ...ref, requested: true };
    for (const [length, valid] of [
      [0, false],
      [25, true],
      [26, false],
    ] as const) {
      expect(
        PullRequestReviewerRequestInput.safeParse({ ...request, reviewers: reviewers(length) })
          .success,
      ).toBe(valid);
      expect(
        PullRequestLabelChangeInput.safeParse({
          ...ref,
          applied: true,
          labels: Array.from({ length }, () => "sample"),
        }).success,
      ).toBe(valid);
    }
  });

  it("takes an invalidation of every read", () => {
    expect(PullRequestInvalidateInput.safeParse({}).success).toBe(true);
    expect(PullRequestInvalidateInput.safeParse({ reference: { number: 7 } }).success).toBe(false);
  });
});
