/**
 * Strips credential-shaped values from a payload before it is kept on an
 * error. Errors travel into logs and bug reports; a token that rode along in
 * a body that failed to decode must not travel with them. No T3 knowledge.
 */
// `d` is the private part of a JSON Web Key.
const SECRET_KEY = /token|credential|secret|authorization|password|ticket|usercode|^dpop$|^d$/iu;
// A URL can carry a one-use code or a token in its query. A query name can be percent-encoded.
const QUERY_NAME = /[?&]([^=&\s]+)=/gu;
const SECRET_QUERY_NAME = /^(?:code|id_token_hint|\w*token)$/iu;
// A URL's user information can hold a password or a token, up to the last `@` of its authority.
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*):\/\/([^\s/?#]*)@/giu;
// Each value of a request's header map can be a credential, under any name.
const SECRET_MAP = /^headers$/iu;

export const REDACTED = "[redacted]";

/**
 * Deep-copies plain objects and arrays, replacing with `"[redacted]"` every
 * string value whose key matches a credential-like name, and every string that
 * holds a URL with a credential. Other values (primitives, class instances) are
 * returned as they are.
 */
export function redactSecrets(value: unknown): unknown {
  return redact(value, new WeakSet());
}

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return holdsSecretUrl(value) ? REDACTED : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    return value.map((item) => redact(item, seen));
  }
  if (!isPlainObject(value)) return value;
  if (seen.has(value)) return undefined;
  seen.add(value);
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_MAP.test(key) && isPlainObject(item)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = typeof item === "string" && SECRET_KEY.test(key) ? REDACTED : redact(item, seen);
  }
  return out;
}

function holdsSecretUrl(text: string): boolean {
  for (const [, name = ""] of text.matchAll(QUERY_NAME)) {
    if (SECRET_QUERY_NAME.test(decodedName(name))) return true;
  }
  for (const [, scheme = "", userinfo = ""] of text.matchAll(URL_USERINFO)) {
    // `git` with no password is the name of an SSH login.
    if (scheme.toLowerCase() !== "ssh" || userinfo !== "git") return true;
  }
  return false;
}

function decodedName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
