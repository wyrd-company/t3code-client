/**
 * Strips credential-shaped values from a payload before it is kept on an
 * error. Errors travel into logs and bug reports; a token that rode along in
 * a body that failed to decode must not travel with them. No T3 knowledge.
 */
// `d` is the private part of a JSON Web Key.
const SECRET_KEY = /token|credential|secret|authorization|password|ticket|usercode|^dpop$|^d$/iu;
// A sign-in URL can carry a one-use code or an identity token in its query.
const SECRET_QUERY = /[?&](?:code|id_token_hint)=/iu;
// Each value of a request's header map can be a credential, under any name.
const SECRET_MAP = /^headers$/iu;

export const REDACTED = "[redacted]";

/**
 * Deep-copies plain objects and arrays, replacing every string value whose
 * key matches a credential-like name, or that holds a sign-in query, with
 * `"[redacted]"`. Other values
 * (primitives, class instances) are returned as they are.
 */
export function redactSecrets(value: unknown): unknown {
  return redact(value, new WeakSet());
}

function redact(value: unknown, seen: WeakSet<object>): unknown {
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
    out[key] =
      typeof item === "string" && (SECRET_KEY.test(key) || SECRET_QUERY.test(item))
        ? REDACTED
        : redact(item, seen);
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
