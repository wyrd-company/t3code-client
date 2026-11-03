import { describe, expect, it } from "vite-plus/test";
import { REDACTED, redactSecrets } from "./redact.ts";

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

  it("replaces a string that holds a URL with a credential, at any depth", () => {
    const secret = [
      "https://sample:sample-password@forge.example.invalid/sample.git",
      "https://sample-token@forge.example.invalid/sample.git",
      "https://forge.example.invalid/sample.git?access_token=sample-token",
      "https://forge.example.invalid/sample.git?private_token=sample-token",
      "https://forge.example.invalid/sample.git?access%5Ftoken=sample-token",
      "https://forge.example.invalid/sample.git?first=1&Access_Token=sample-token",
      "https://git@sample:sample-password@forge.example.invalid/sample.git",
      "https://git@forge.example.invalid/sample.git",
      "ssh://git:sample-password@forge.example.invalid/sample.git",
      "ssh://git@sample:sample-password@forge.example.invalid/sample.git",
      "ssh://sample@forge.example.invalid/sample.git",
      "git clone https://sample:sample-password@forge.example.invalid/sample.git failed",
    ];
    for (const url of secret) {
      expect(redactSecrets({ remoteUrl: url, args: ["clone", url] })).toEqual({
        remoteUrl: "[redacted]",
        args: ["clone", "[redacted]"],
      });
    }
  });

  it("keeps a URL with no credential, and an SSH login name", () => {
    const kept = [
      "https://forge.example.invalid/sample.git",
      "https://forge.example.invalid/search?query=sample",
      "https://forge.example.invalid/search?query=%zz",
      "git@forge.example.invalid:sample/repository.git",
      "ssh://git@forge.example.invalid/sample/repository.git",
      "sample@example.invalid",
    ];
    expect(redactSecrets({ kept })).toEqual({ kept });
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

it("redacts an OAuth verifier and a URL's state, and keeps an error's code and a status", () => {
  expect(
    redactSecrets({
      code: "not_found",
      state: "open",
      code_verifier: "sample-verifier",
      url: "https://app.invalid/back?state=sample-state",
      link: "/sample?code_verifier=sample-verifier",
    }),
  ).toEqual({
    code: "not_found",
    state: "open",
    code_verifier: REDACTED,
    url: REDACTED,
    link: REDACTED,
  });
});
