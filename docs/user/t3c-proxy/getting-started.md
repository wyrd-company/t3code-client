---
product: t3c-proxy
title: Getting started
order: 1
relationships:
  references: [proxy]
---

# Show who sent each message

Stock T3 Code has one owner identity, so a server that people share cannot name the
person who sent a message. `t3c-proxy` is a service in front of one stock server. Each
person has one listener and their own hostname. Each message that they send there ends
with this last paragraph:

```text
— Sent by Alice
```

The server does not change. Agents use the server's own MCP routes and the direct route,
so their messages have no byline. A slash command such as `/compact` also has no byline,
because the server matches it on the exact text. All other traffic passes through
unchanged.

Use the proxy only among people who trust each other. The byline names a hostname and
does not prove a person. T3 pairing and sessions are the only access control, and anyone
with a valid session can use any hostname.

## Install

Node >=22.16 is required.

```sh
npm install -g @wyrd-company/t3code-proxy
```

For a dev container, use the [Feature](devcontainer-feature.md).

## Configure

Give the server's address and one port for each person:

```yaml
upstream: http://127.0.0.1:3773
host: 127.0.0.1
users:
  - name: Alice
    port: 4101
  - name: Sam
    port: 4102
```

```sh
t3c-proxy --config /etc/t3code-proxy/config.yml
```

You can use flags in place of the file, or to replace a value in the file:

```sh
t3c-proxy --upstream http://127.0.0.1:3773 --user Alice=4101 --user Sam=4102
```

| Option             | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| `--config FILE`    | YAML file with `upstream`, `host` and `users`              |
| `--upstream URL`   | The server URL, with no path or credentials                |
| `--host ADDRESS`   | The listener address. The default is `127.0.0.1`           |
| `--user NAME=PORT` | One person. Any `--user` replaces the full `users` list    |
| `--list-users`     | Validate the config, print each port, a tab and name, exit |
| `--version`        | Print the version                                          |
| `--help`           | Print the usage                                            |

An unknown key or an invalid value stops the service before it listens. The service reads
the file when it starts, so a change needs a restart. SIGTERM and SIGINT close the
listeners and all connections. Logs go to stderr, and they hold no message text, tokens or
URLs.

## Connect each person

1. Put each listener behind HTTPS with its own hostname. See
   [the reverse proxy example](reverse-proxy.md).
2. Create a pairing link for each person's hostname on the server:

   ```sh
   t3 auth pairing create --base-url https://t3-alice.example.test
   ```

3. The person opens the link and then uses that hostname.

Read [the accepted limits](limits.md) before you share the hostnames.
