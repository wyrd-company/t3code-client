---
product: t3c-proxy
title: Dev container Feature
order: 4
relationships:
  references: [proxy]
---

# Run the proxy in a dev container

`ghcr.io/wyrd-company/t3code-client/t3code-proxy` runs `t3c-proxy` under
[s6-overlay](https://github.com/just-containers/s6-overlay) 3. It needs a Debian or Ubuntu
image with s6-overlay 3, such as `ghcr.io/wyrd-company/devcontainers/base`. The installer
checks this before it changes anything.

| Option        | Default                        | Purpose                                                  |
| ------------- | ------------------------------ | -------------------------------------------------------- |
| `version`     | `latest`                       | npm version of the package: `latest` or an exact version |
| `configPath`  | `/etc/t3code-proxy/config.yml` | The file passed to `t3c-proxy --config`                  |
| `serviceUser` | `automatic`                    | The user that runs the service                           |

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

You supply the config file. The Feature does not write it and declares no mount, because
the file names your people. Without the file the service stops with an error. The file
has [the format of the package](getting-started.md#configure). The `mounts` line in this
example is one way to supply it, and `target` must match `configPath`.

When the t3code-server Feature has a `dnsName` and the Caddy Feature is installed, the
service writes one Caddy site for each person. Each hostname is the server's hostname with
the person's name in lowercase added to the first label:

| Person | Port | Hostname                    |
| ------ | ---- | --------------------------- |
| Alice  | 4101 | `t3-alice.dev.example.test` |
| Sam    | 4102 | `t3-sam.dev.example.test`   |

The server's own hostname stays as the direct route. Without a `dnsName`, the service
writes no Caddy file, and you supply [the reverse proxy](reverse-proxy.md).

The [Feature README](https://github.com/wyrd-company/t3code-client/tree/main/features/src/t3code-proxy)
has the full steps for the config file, DNS and ports.
