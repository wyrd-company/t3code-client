// ---
// relationships:
//   implements: library
// ---
/**
 * The value lists that a pull request result leaves open and a write input closes, so that
 * the two forms cannot drift. This module is not part of `schemas.pullRequests`.
 */
export const PULL_REQUEST_ACTIONS = [
  "merge",
  "ready",
  "draft",
  "close",
  "reopen",
  "delete-branch",
  "update-branch",
  "enable-auto-merge",
  "disable-auto-merge",
  "revert",
  "approve-workflows",
] as const;

export const PULL_REQUEST_REACTIONS = [
  "thumbs-up",
  "thumbs-down",
  "laugh",
  "hooray",
  "confused",
  "heart",
  "rocket",
  "eyes",
] as const;
