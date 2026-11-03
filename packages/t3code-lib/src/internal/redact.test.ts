import { describe, expect, it } from "vite-plus/test";
import { redactSecrets } from "./redact.ts";

describe("redactSecrets", () => {
  it("replaces the private part of a key and a proof, and keeps the public part", () => {
    expect(redactSecrets({ dpopKey: { x: "kept", d: "private" }, dpop: "proof" })).toEqual({
      dpopKey: { x: "kept", d: "[redacted]" },
      dpop: "[redacted]",
    });
  });

  it("replaces a whole header map, since any header can hold a credential", () => {
    expect(redactSecrets({ providerId: "kept", headers: { "x-sample": "value" } })).toEqual({
      providerId: "kept",
      headers: "[redacted]",
    });
  });

  it("replaces string values under credential-like keys, at any depth", () => {
    const input = {
      access_token: "abc",
      refreshToken: "def",
      credential: "ghi",
      clientSecret: "jkl",
      Authorization: "Bearer mno",
      password: "pqr",
      wsTicket: "stu",
      label: "kept",
      nested: { list: [{ token: "vwx", count: 1 }, "plain"] },
    };
    expect(redactSecrets(input)).toEqual({
      access_token: "[redacted]",
      refreshToken: "[redacted]",
      credential: "[redacted]",
      clientSecret: "[redacted]",
      Authorization: "[redacted]",
      password: "[redacted]",
      wsTicket: "[redacted]",
      label: "kept",
      nested: { list: [{ token: "[redacted]", count: 1 }, "plain"] },
    });
  });

  it("replaces a device code and a sign-in URL with a code or an identity token", () => {
    expect(
      redactSecrets({
        userCode: "ABCD-EFGH",
        callbackUrl: "http://127.0.0.1:1/auth/callback?state=s&code=abc",
        interaction: { url: "https://example.invalid/authorize?id_token_hint=abc" },
        url: "https://example.invalid/authorize?code_challenge=public",
      }),
    ).toEqual({
      userCode: "[redacted]",
      callbackUrl: "[redacted]",
      interaction: { url: "[redacted]" },
      url: "https://example.invalid/authorize?code_challenge=public",
    });
  });

  it("copies instead of mutating and leaves non-string secrets and non-plain values alone", () => {
    const input = { token: 42, tokens: ["a"], when: new Date(0) };
    const out = redactSecrets(input) as typeof input;
    expect(out).not.toBe(input);
    expect(out.token).toBe(42);
    expect(out.tokens).toEqual(["a"]);
    expect(out.when).toBe(input.when);
    expect(redactSecrets("token")).toBe("token");
    expect(redactSecrets(null)).toBeNull();
  });

  it("survives a cycle", () => {
    const input: Record<string, unknown> = { token: "x" };
    input["self"] = input;
    expect(redactSecrets(input)).toEqual({ token: "[redacted]", self: undefined });
  });
});
