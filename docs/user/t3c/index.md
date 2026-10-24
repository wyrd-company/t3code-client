---
product: t3c
title: Getting started
order: 1
relationships:
  references:
    - command-line
    - profiles
    - releasing
---

![t3c pairs a profile, starts and waits for a thread, and lists projects](assets/demo.gif)

The recording pairs a fresh profile through stdin, starts a Luna thread, waits for
its answer, continues the conversation, and lists the selected project and thread.

# Run a conversation from your terminal

`t3c` sends prompts to a stock T3 Code server and prints the assistant's final
answer. Use it in a terminal or a harness that supplies a prompt on stdin.
Node >=22.16 is required. The target is T3 Code 0.1.0, protocol 2.

Install with npm or Homebrew:

```sh
npm install -g @wyrd-company/t3code-cli
# or
brew install wyrd-company/tools/t3c
```

On the server, use upstream `t3 pair` or `t3 auth pairing create` to obtain a
pairing link. Pair it through `t3c auth pair '<pairing-link>'`. For an issued
session token, use stdin so the token stays out of the argument list:

```sh
t3c auth pair --server https://server.example --token-stdin --name example
```

Supply the token through stdin from your existing secret source. The command
validates it before saving a profile. See [auth and profiles](auth.md).

```sh
t3c version
t3c run 'Reply with one short greeting.' --model gpt-6-luna
printf 'List three basic colors.\n' | t3c run --model gpt-6-luna
t3c thread list
t3c thread read <thread-id> --last
t3c run --thread <thread-id> 'Put the colors in alphabetical order.'
```

`run` waits without a default run deadline. Add `--timeout 5m` when needed.
Project paths are paths on the server. `--project-path /workspace/project`
selects that project; omission uses the server Scratch project. Provider and
model selection use project defaults, then server defaults. Ambiguous selection
asks for an explicit choice through a usage error.

Use [command behavior](commands.md), [output and exit codes](policy.md),
[the Dagu harness](dagu.md), or [the library API](library-reference.md) for details.
`t3c --help` and each command's `--help` list supported options.
