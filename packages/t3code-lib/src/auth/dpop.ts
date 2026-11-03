// ---
// relationships:
//   implements: library-auth
// ---
/**
 * DPoP (RFC 9449) proofs for a proof-bound session: a compact ES256 JWT that
 * names one request, signed by the key the session is bound to. Each proof has
 * a new `jti`, because the server refuses a replayed one.
 */
import * as NodeCrypto from "node:crypto";

import { T3PreconditionError } from "../errors.ts";
import type { Clock } from "../internal/clock.ts";
import { systemClock } from "../internal/clock.ts";
import type { DpopPrivateJwk } from "../schemas/auth.ts";

export interface DpopProofInput {
  readonly key: DpopPrivateJwk;
  readonly method: string;
  readonly url: URL | string;
  /** The token the request presents: the access token, or the ticket of a socket upgrade. */
  readonly accessToken?: string;
  readonly clock?: Clock;
}

/** Generate a P-256 key. The caller owns it until a token exchange stores it. */
export function generateDpopKey(): DpopPrivateJwk {
  const { privateKey } = NodeCrypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const { x, y, d } = privateKey.export({ format: "jwk" });
  if (x === undefined || y === undefined || d === undefined) {
    throw new T3PreconditionError("The generated DPoP key has no P-256 coordinates.");
  }
  return { kty: "EC", crv: "P-256", x, y, d };
}

/** Sign a proof for one request. A socket URL is named as the HTTP request the server sees. */
export function createDpopProof(input: DpopProofInput): string {
  const { kty, crv, x, y } = input.key;
  const header = { typ: "dpop+jwt", alg: "ES256", jwk: { kty, crv, x, y } };
  const payload = {
    htm: input.method.toUpperCase(),
    htu: proofUrl(input.url),
    jti: NodeCrypto.randomUUID(),
    iat: Math.floor((input.clock ?? systemClock).now().getTime() / 1_000),
    ...(input.accessToken === undefined ? {} : { ath: sha256Base64Url(input.accessToken) }),
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  return `${signingInput}.${sign(input.key, signingInput)}`;
}

function proofUrl(value: URL | string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new T3PreconditionError("The DPoP proof URL is not valid.", { cause });
  }
  // The server compares without the query and the fragment.
  url.search = "";
  url.hash = "";
  if (url.protocol === "ws:") url.protocol = "http:";
  if (url.protocol === "wss:") url.protocol = "https:";
  return url.toString();
}

function sign(key: DpopPrivateJwk, signingInput: string): string {
  let privateKey: NodeCrypto.KeyObject;
  try {
    privateKey = NodeCrypto.createPrivateKey({ key: { ...key }, format: "jwk" });
  } catch (cause) {
    throw new T3PreconditionError("The DPoP key is not a valid P-256 private key.", { cause });
  }
  // JWS ES256 is the raw r and s values, not the DER form that Node signs by default.
  return NodeCrypto.sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sha256Base64Url(value: string): string {
  return NodeCrypto.createHash("sha256").update(value).digest("base64url");
}
