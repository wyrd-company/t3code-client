---
product: t3c-proxy
title: Reverse proxy
order: 2
relationships:
  references: [proxy]
---

# Put each person behind HTTPS

Each person needs their own hostname, because cookies ignore ports. `t3c-proxy` has no
HTTPS of its own. Keep its listeners on loopback or a private network, and put an HTTPS
reverse proxy in front of them.

This [Caddy](https://caddyserver.com/) file has one site for each person in
[the sample configuration](getting-started.md#configure), and one site for the direct
route:

```caddyfile
t3-alice.example.test {
    reverse_proxy 127.0.0.1:4101
}

t3-sam.example.test {
    reverse_proxy 127.0.0.1:4102
}

t3.example.test {
    reverse_proxy 127.0.0.1:3773
}
```

The last site goes to the server and not to `t3c-proxy`, so messages on that hostname have
no byline. Remove it if nobody uses the direct route. Every other route to the server's
port is also a direct route, so do not expose that port in another way.

Every hostname must resolve to the reverse proxy. A wildcard DNS record supplies the names.

## Other reverse proxies

Caddy does these things by default. Another reverse proxy must do them too:

- Pass WebSocket upgrades on `/ws`.
- Keep the `Host` header and set the `X-Forwarded-*` headers, so that the server's origin
  checks and issuer URLs use the person's hostname.
- Pass streamed responses with no buffering.

The live proof of `t3c-proxy` uses Caddy. It does not use other reverse proxies.
