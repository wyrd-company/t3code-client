---
t3code-proxy-feature: minor
---

Add the `t3code-proxy` devcontainer Feature at `ghcr.io/wyrd-company/t3code-client/t3code-proxy`. It runs `t3c-proxy` under s6-overlay with a config file that you supply, and writes one Caddy site for each person when the t3code-server Feature has a DNS name.
