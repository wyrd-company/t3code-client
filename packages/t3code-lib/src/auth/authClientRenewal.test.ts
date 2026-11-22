// ---
// relationships:
//   verifies: library-auth
// ---
import { describe, expect, it, vi } from "vite-plus/test";
import { T3Client } from "../client.ts";
import { memoryCredentialStore, type CredentialStore } from "./credentialStore.ts";
import { generateDpopKey } from "./dpop.ts";

function authClient(fetch: typeof globalThis.fetch, credentials: CredentialStore) {
  return T3Client.create({ baseUrl: "https://example.invalid", fetch, credentials }).auth;
}

describe("DPoP token renewal", () => {
  const response = (tokenType = "DPoP", scope = "orchestration:read") =>
    Response.json({
      access_token: "renewed-credential",
      issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
      token_type: tokenType,
      expires_in: 3600,
      scope,
    });
  const pairedStore = () =>
    memoryCredentialStore({
      accessToken: "bound-credential",
      dpopKey: generateDpopKey(),
      sessionMethod: "dpop-access-token",
      scopes: ["orchestration:read"],
    });

  it.each([{}, { accessToken: "bearer-token" }, { dpopKey: generateDpopKey() }])(
    "requires both a token and proof key",
    async (credentials) => {
      const fetch = vi.fn(async () => response());
      const client = authClient(fetch, memoryCredentialStore(credentials));
      await expect(client.renewAccessToken()).rejects.toThrow("requires a DPoP session");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("preserves the original credentials if the server returns a bearer token", async () => {
    const store = pairedStore();
    const client = authClient(async () => response("Bearer"), store);

    await expect(client.renewAccessToken()).rejects.toThrow("did not contain a DPoP token");
    await expect(store.load()).resolves.toMatchObject({ accessToken: "bound-credential" });
    expect(client.credentialsVersion).toBe(0);
  });

  it.each(["logout", "shared store replacement"] as const)(
    "keeps an intervening %s when the renewal response arrives",
    async (change) => {
      const store = pairedStore();
      let respond!: (value: Response) => void;
      const reply = new Promise<Response>((resolve) => {
        respond = resolve;
      });
      const fetch = vi.fn(() => reply);
      const client = authClient(fetch, store);
      const pending = client.renewAccessToken();
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      if (change === "logout") await client.clearCredentials();
      else await store.save({ accessToken: "new-login" });
      respond(response());

      await expect(pending).rejects.toThrow("credential changed during renewal");
      await expect(store.load()).resolves.toEqual(
        change === "logout" ? {} : { accessToken: "new-login" },
      );
    },
  );

  it("reports a different grant as a replacement", async () => {
    const store = pairedStore();
    const client = authClient(async () => response("DPoP", "access:read"), store);
    const onChange = vi.fn();
    client.onCredentialsChange(onChange);

    await client.renewAccessToken();
    await expect(client.currentScopes()).resolves.toEqual(["access:read"]);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("replacement");
  });
});
