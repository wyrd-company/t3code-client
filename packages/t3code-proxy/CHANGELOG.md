# Changelog

## 0.1.0

### Features

- Add `t3c-proxy`, a service in front of a shared stock T3 Code server. Each person has one listener, configured from a YAML file or flags. Messages that a person sends on their listener end with `— Sent by <name>`, and all other traffic passes through unchanged.
