---
relationships:
  references: [proxy]
---

# @wyrd-company/t3code-proxy

`t3c-proxy` is a service in front of one stock T3 Code server. It shows who sent each
message when people share the server. Each person has one listener and their own
hostname, and each message they send ends with `— Sent by <name>`. Agents and clients
that use the server directly get no byline. Node >=22.16 is required.

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
t3c-proxy --upstream http://127.0.0.1:3773 --user Alice=4101 --user Sam=4102
t3c-proxy --config /etc/t3code-proxy/config.yml --list-users
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

A flag replaces the same value in the file. An unknown key or an invalid value stops
the service before it listens. The service reads the file when it starts, so a change
needs a restart. Logs go to stderr and hold no message text, tokens or URLs. SIGTERM and
SIGINT close the listeners and all connections.

Put each listener behind an HTTPS reverse proxy with its own hostname, because cookies
ignore ports. T3 pairing and sessions are the only access control: the proxy has no
login. The byline names an endpoint and does not prove a person, so use it only among
people who trust each other.

The [guides](https://wyrd.foo/docs/t3c-proxy/getting-started) have a reverse proxy example,
the accepted limits and the dev container Feature.
