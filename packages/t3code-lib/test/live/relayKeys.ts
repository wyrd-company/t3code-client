// ---
// relationships:
//   implements: library-testing
// ---
/**
 * What a live test needs to act as the relay of a linked server: a local Ed25519 key, and the
 * tokens that key signs. No relay is reached. The server's own tokens are read and checked here.
 */
import * as NodeCrypto from "node:crypto";

export interface RelayKeys {
  readonly publicKey: string;
  sign(typ: string, payload: Readonly<Record<string, unknown>>): string;
}

const encodePart = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

export function relayKeys(): RelayKeys {
  const { publicKey, privateKey } = NodeCrypto.generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    sign: (typ, payload) => {
      const signed = `${encodePart({ alg: "EdDSA", typ })}.${encodePart(payload)}`;
      const signature = NodeCrypto.sign(null, Buffer.from(signed), privateKey);
      return `${signed}.${signature.toString("base64url")}`;
    },
  };
}

/** The header and claims of `token`, after a check of its signature with `publicKey`. */
export function verifiedClaims(
  token: string,
  publicKey: string,
): { readonly typ: unknown; readonly claims: Record<string, unknown> } {
  const [header = "", claims = "", signature = ""] = token.split(".");
  const valid = NodeCrypto.verify(
    null,
    Buffer.from(`${header}.${claims}`),
    publicKey,
    Buffer.from(signature, "base64url"),
  );
  if (!valid) throw new Error("The token's signature does not match the key.");
  const decode = (part: string) =>
    JSON.parse(Buffer.from(part, "base64url").toString()) as Record<string, unknown>;
  return { typ: decode(header)["typ"], claims: decode(claims) };
}
