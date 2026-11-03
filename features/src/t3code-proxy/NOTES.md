[t3c-proxy](https://github.com/wyrd-company/t3code-client) runs under [s6-overlay](https://github.com/just-containers/s6-overlay) in front of a shared [T3 Code](https://t3.codes/) server. It adds `— Sent by <name>` to each message that a person sends on their own hostname. Agents and the server's own hostname stay clean.

You supply the config file. The Feature does not write it and declares no mount. A missing or invalid file stops the service: read the error with `docker logs`. The service reads the file when it starts, so run `/command/s6-svc -r /run/service/t3code-proxy` as root after a change.

With the t3code-server Feature's `dnsName` and the [Caddy](https://caddyserver.com/) Feature, each person gets a hostname such as `t3-alice.dev.example.test`. Every hostname must resolve, because Caddy waits for all of them. Use a wildcard DNS record. Publish ports 80 and 443 of the container and point the record at the Docker host, because a browser cannot reach the container's own network. A name that does not make a DNS label stops the service. Without `dnsName` the listeners stay on `host`, and you supply the reverse proxy.

The service starts after `ansible-setup` and `t3code-server` when those services exist.

## Trademarks

This feature is not affiliated with or endorsed by T3 Tools Inc. T3 Code is a trademark of T3 Tools Inc. All trademarks and copyrights belong to their holders.

Logo: drawn for this feature in the shared feature frame.
