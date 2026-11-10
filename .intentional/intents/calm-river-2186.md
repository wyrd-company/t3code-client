---
t3c-docs: patch
t3code-lib: minor
---

Pull request changes of T3 Code 0.1.8: `pullRequests.runAction` takes `replyWithSummary` and then answers with the `PullRequestSummary`; `pullRequests.reviewerCandidates` takes `query` (`PullRequestReviewerCandidatesInput`); `pullRequests.filterOptions` takes kind `references` with a `sigil` and reads `references` (`PullRequestReferenceCandidate`). Capabilities read `mentions`, `referenceSigils` and `reviewers.searchCandidates`; summaries read `headSha`, `autoMergeEnabled` and `autoMergeMethod`; previews read `updatedAt` and `observedAt`; linked threads read `settled`; thread comment pages read `hiddenCount`.
