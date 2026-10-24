---
product: t3c
title: Auth and profiles
order: 2
relationships:
  references:
    - command-line
    - profiles
---

# Connect to servers

Create a pairing link in the target server with upstream `t3 pair` or
`t3 auth pairing create`. Pair the CLI with either link form:

```bash
t3c auth pair 'https://server.example/pair#token=PAIRING_TOKEN' --name sample
t3c auth pair 'https://other.example/?token=PAIRING_TOKEN' --name secondary
```

Without `--name`, the profile name is the server host, including its port.
The first successful pair becomes current. Later pairs preserve current.
Pairing validates the credential before registering the profile.

For automation, supply an explicit server and one token source:

```bash
t3c auth pair --server https://server.example --pairing-token PAIRING_TOKEN --name sample
printf '%s\n' "$PAIRING_TOKEN" | t3c auth pair --server https://server.example --pairing-token-stdin --name sample
printf '%s\n' "$SESSION_TOKEN" | t3c auth pair --server https://server.example --token-stdin --name sample
```

`--token-stdin` imports an already issued session token. Issue it upstream with
`t3 auth session issue --ttl 30d --token-only`. The CLI does not issue tokens
or perform browser OAuth. Stdin flags consume piped input and require no
interactive prompt. A pairing link and a split token source cannot be combined.

Inspect and select profiles:

```bash
t3c auth status
t3c auth status --json
t3c auth switch secondary
t3c auth logout sample
t3c auth logout
```

Status probes every exact profile name, including names that share one server
URL. It reports the current marker, server URL and label, scopes, expiry,
reachability and authentication. One failed profile does not hide other results.
It also probes the effective connection and reports its server and credential
sources. With a flag or environment override, that effective probe determines
the exit code. Otherwise current determines it; no current exits successfully.

The public environment descriptor supplies label and reachability. Session
state supplies authentication, scopes and expiry. A reported past expiry is
`expired`; upstream rejection without expiry is `auth_invalid`. An unreachable
server exits 8; rejected or expired credentials exit 9; local storage failures
exit 1. Unknown switch/logout names exit 2. Exact library named lookup failures
retain `not_found` and exit 10.

Server selection uses `--server`, then `T3_SERVER_URL`, then current.
Credentials use `--credentials`, then `T3_TOKEN`, then that profile's saved
credential. `T3_TOKEN` alone uses the current server. Overrides are not saved.
Blank environment inputs fall through as defined in the
[library configuration contract](https://github.com/wyrd-company/t3code-client/blob/main/docs/profiles.md#configuration).

Config and credentials are separate. The config root uses `T3C_CONFIG_HOME`,
then `$XDG_CONFIG_HOME/t3c`, then `~/.config/t3c`. Each named profile has its own
0600 credential file. Logout removes the local profile and its credential;
it does not revoke the upstream session. Removing current clears the current
selection without choosing another profile.
