# Changelog

## 0.2.0

### Features

- Add launch and continuation controls: repeatable --model-option key=value validated against the selected model's advertised options, --clear-model-options, --existing-worktree, --branch, and --start-from-origin/--no-start-from-origin for new worktrees. thread send accepts the model option controls.
- Add thread stop, thread queue resume and thread queue start commands; expose queued run IDs in text status for selection.
- Add thread status, requests, usage, diff and search commands with JSON envelopes and concise text.
- Add thread find with provider and native session inputs, returning a T3 Code thread ID or null.
- Add schedule management, webhook endpoint rotation and delivery inspection, exact provider status, and historical usage summaries with explicit date and time-zone bounds. Schedule input accepts JSON files or stdin and focused execution selection flags while preserving omitted update fields.

### Fixes

- Validate bound scheduled-task threads against their effective project before CLI creation or target changes. Expose explicit target validation with read scope while preserving native operate-only upserts and omitted update fields.

## 0.1.1

### Fixes

- Publish the t3c docs from docs/user in the wyrd.foo format.
- Report stock T3 Code 0.1.2 as the target server and verify CLI compatibility.

## 0.1.0

### Features

- Provide the t3c Node command-line client for stock T3 Code, with its command contract, commander composition, version reporting, structured output, shared error mapping, installable executable and isolated live acceptance recipe.
  
  Specify the t3c command surface, execution policies and Dagu harness contract.
  
  Pair named server profiles from links and stdin tokens, probe exact profile credentials and effective overrides, switch the current server and remove local credentials.
  
  Run prompts from arguments, files or stdin against selected projects, models and worktrees; start, send to, wait on, read, list, interrupt and answer threads; list and ensure projects; and report server providers and models. Waiting commands support run deadlines that detach or interrupt, signal interruption, pending-request policies, approval decisions, streaming and structured results.
  Prepare tagged documentation, generated library reference, isolated recorded demo, registry shrinkwrap handoff and Homebrew distribution with local artifact validation.
  
  Preserve the tap formula when published bytes differ, protect existing Homebrew installations with preflight regression coverage, and record the unreleased CLI demo without a visible interim version frame.
  
  Record real stdin pairing to a fresh profile, start and wait on one linked thread and run, and list its selected project; preserve generic continuation and thread listing with verified outcomes.
