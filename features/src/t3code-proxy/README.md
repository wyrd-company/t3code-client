# T3 Code Sender Identity Proxy

Runs [`t3c-proxy`](https://github.com/wyrd-company/t3code-client) under [s6-overlay](https://github.com/just-containers/s6-overlay) 3, in front of a shared [T3 Code](https://t3.codes/) server. People who share a server each have their own hostname. A message that a person sends there ends with `— Sent by <name>`. Agents and the server's own hostname stay clean.

The Feature requires a Debian/Ubuntu image with s6-overlay 3, such as `ghcr.io/wyrd-company/devcontainers/base`. The installer checks this before it changes anything. [Node.js](https://nodejs.org/) 24 comes from the official [Dev Container Node Feature](https://github.com/devcontainers/features/tree/main/src/node).

## Options

| Option        | Type   | Default                        | Description                                                                                                             |
| ------------- | ------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `version`     | string | `latest`                       | npm version of `@wyrd-company/t3code-proxy`: `latest` or an exact version. A leading `v` is removed.                    |
| `configPath`  | string | `/etc/t3code-proxy/config.yml` | Absolute path of the config file in the container. The service passes it to `t3c-proxy --config`.                       |
| `serviceUser` | string | `automatic`                    | User account that runs the service. Automatic selection prefers the remote user, container user, `vscode`, then `root`. |

## Example usage

```json
{
  "image": "ghcr.io/wyrd-company/devcontainers/base:noble",
  "features": {
    "ghcr.io/wyrd-company/devcontainers/caddy:1": {},
    "ghcr.io/wyrd-company/devcontainers/t3code-server:2": {
      "dnsName": "t3.dev.example.test"
    },
    "ghcr.io/wyrd-company/t3code-client/t3code-proxy:0": {}
  },
  "overrideCommand": false,
  "appPort": ["80:80", "443:443"],
  "mounts": [
    "source=${localWorkspaceFolder}/.devcontainer/t3code-proxy.yml,target=/etc/t3code-proxy/config.yml,type=bind,readonly"
  ]
}
```

`overrideCommand` is `false` so that the image starts s6-overlay, which runs the services. `appPort` publishes the ports of Caddy, as [Reach the hostnames](#reach-the-hostnames) explains.

## Supply the config file

The Feature does not write the config file and declares no mount, because the file names your people and only you know them. Without the file the service stops with an error.

The file has the server's address and one port for each person:

```yaml
upstream: http://127.0.0.1:3773
users:
  - name: Alice
    port: 4101
  - name: Sam
    port: 4102
```

A bind mount makes one file from your computer show in the container. The `mounts` line in the example has these parts:

| Part                                                            | What it does                                                                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `source=${localWorkspaceFolder}/.devcontainer/t3code-proxy.yml` | The file on your computer. `${localWorkspaceFolder}` is the folder that you opened, so the file can stay in your repository. |
| `target=/etc/t3code-proxy/config.yml`                           | The path of the file in the container. It must match `configPath`.                                                           |
| `type=bind`                                                     | Show the file from your computer. Docker copies nothing, so a rebuild keeps the file.                                        |
| `readonly`                                                      | The container cannot change the file.                                                                                        |

The file must exist before the container starts, and the service user must be able to read it. The service reads the file when it starts. After a change, run this as root in the container:

```bash
/command/s6-svc -r /run/service/t3code-proxy
```

An edit that replaces the file, as many editors do, does not reach a running container, because the bind mount holds the old file. Restart the container in that case.

## Hostnames with Caddy

Cookies ignore ports, so each person needs their own hostname. When the [t3code-server](https://github.com/wyrd-company/devcontainers/tree/main/src/features/t3code-server) Feature has a `dnsName` and the [Caddy](https://caddyserver.com/) Feature is installed, the service writes one site for each person when it starts:

| Person | Port | Hostname                    |
| ------ | ---- | --------------------------- |
| Alice  | 4101 | `t3-alice.dev.example.test` |
| Sam    | 4102 | `t3-sam.dev.example.test`   |

The hostname is the server's hostname with the person's name in lowercase added to the first label. The server's own hostname stays as the direct route, with no byline.

- Every hostname must resolve, because Caddy waits for all required hosts before it starts or reloads. One unresolved name holds back all sites. A wildcard DNS record for the parent domain, here `*.dev.example.test`, supplies the names.
- The service stops with an error when a name does not make a valid DNS label, for example a name with a space, or when two names make the same label.
- The files are `/etc/caddy/conf.d/t3code-proxy.caddy` and `/etc/caddy/required-hosts.d/t3code-proxy.host`. The service replaces them at each start, so a removed person loses their site.
- The sites connect to `127.0.0.1`, so keep `host` at its default or use an address that includes loopback.

### Reach the hostnames

A container has its own network, so a browser cannot reach Caddy until something connects the two. The Feature does not do this for you.

- Publish ports 80 and 443 of the container on the Docker host, with `appPort` as in the example, or put another HTTPS entry point in front of the container.
- Point the wildcard DNS record at the Docker host or at that entry point, not at the container.
- Caddy gets certificates with ACME, and the public certificate authorities connect back to these ports and hostnames. For a private network, set the Caddy Feature's `acmeCa` option to a certificate authority that can reach them.

Without a `dnsName` or without the t3code-server Feature, the service writes no Caddy file and the listeners stay on `host`. Supply your own HTTPS reverse proxy, with one hostname for each person.

## Service

The `t3code-proxy` longrun under s6-overlay runs `/usr/local/bin/t3code-proxy-service` as `serviceUser` with its full environment. The service reads the config with `t3c-proxy --list-users`, writes the Caddy files, and then runs `t3c-proxy --config <configPath>`. Logs go to the container log.

When a Caddy Feature is installed, the installer adds `serviceUser` to the `caddy-config` group. The service starts after the `ansible-setup` and `t3code-server` services when they exist. If one of them fails, this service does not start.

## Versions

The Feature and the npm package have separate versions. A package release needs no Feature release, because `version` defaults to `latest`, which the Feature reads when it builds. Rebuild the container to get a new package version.

## Trademarks

This feature is not affiliated with or endorsed by T3 Tools Inc. T3 Code is a trademark of T3 Tools Inc. All trademarks and copyrights belong to their holders.

Logo: drawn for this feature in the shared feature frame.
