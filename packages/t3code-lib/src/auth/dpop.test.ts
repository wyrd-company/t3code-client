// ---
// relationships:
//   verifies: library-auth
// ---
import * as NodeCrypto from "node:crypto";
import { describe, expect, it } from "vite-plus/test";

import { T3PreconditionError } from "../errors.ts";
import { createDpopProof, generateDpopKey } from "./dpop.ts";

const decodePart = (part: string | undefined): Record<string, unknown> =>
  JSON.parse(Buffer.from(part ?? "", "base64url").toString()) as Record<string, unknown>;

const clock = { now: () => new Date("2030-01-02T03:04:05.000Z") };

describe("createDpopProof", () => {
  it("signs an ES256 proof that the public key verifies", () => {
    const key = generateDpopKey();
    const proof = createDpopProof({
      key,
      method: "post",
      url: "https://host.invalid/api/sample?query=1#part",
      accessToken: "sample-token",
      clock,
    });
    const [header, payload, signature] = proof.split(".");
    expect(decodePart(header)).toEqual({
      typ: "dpop+jwt",
      alg: "ES256",
      jwk: { kty: "EC", crv: "P-256", x: key.x, y: key.y },
    });
    expect(decodePart(payload)).toMatchObject({
      htm: "POST",
      htu: "https://host.invalid/api/sample",
      iat: Math.floor(clock.now().getTime() / 1_000),
      ath: NodeCrypto.createHash("sha256").update("sample-token").digest("base64url"),
    });
    const { d: _private, ...publicJwk } = key;
    const verified = NodeCrypto.verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      {
        key: NodeCrypto.createPublicKey({ key: publicJwk, format: "jwk" }),
        dsaEncoding: "ieee-p1363",
      },
      Buffer.from(signature ?? "", "base64url"),
    );
    expect(verified).toBe(true);
  });

  it("names a socket URL as the HTTP request the server sees", () => {
    const key = generateDpopKey();
    const payload = (url: string) =>
      decodePart(createDpopProof({ key, method: "GET", url }).split(".")[1]);
    expect(payload("ws://host.invalid:3000/ws?wsTicket=sample")["htu"]).toBe(
      "http://host.invalid:3000/ws",
    );
    expect(payload("wss://host.invalid/ws")["htu"]).toBe("https://host.invalid/ws");
  });

  it("uses a new jti for each proof and omits ath without a token", () => {
    const key = generateDpopKey();
    const proof = () =>
      decodePart(
        createDpopProof({ key, method: "GET", url: "https://host.invalid/" }).split(".")[1],
      );
    const first = proof();
    expect(first["jti"]).not.toBe(proof()["jti"]);
    expect(first).not.toHaveProperty("ath");
  });

  it("reports an unusable key or URL as caller misuse", () => {
    const key = generateDpopKey();
    expect(() =>
      createDpopProof({ key: { ...key, d: "AA" }, method: "GET", url: "https://host.invalid/" }),
    ).toThrow(T3PreconditionError);
    expect(() => createDpopProof({ key, method: "GET", url: "not a url" })).toThrow(
      T3PreconditionError,
    );
  });
});
