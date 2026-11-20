// ---
// relationships:
//   verifies: library-auth
// ---
import { describe, expect, it, vi } from "vite-plus/test";

import { HttpTransport } from "../transport/http.ts";
import { HttpRouteClient } from "../http/client.ts";
import { httpRoutes } from "../http/registry.ts";
import { AuthAccessSnapshot } from "../rpc/methods/authAccess.ts";
import { AuthPairingLink } from "./auth.ts";

const at = "2026-01-01T00:00:00.000Z";
const client = { deviceType: "mobile", os: "Sample OS" };
const link = {
  id: "link-1",
  scopes: ["orchestration:read"],
  subject: "cloud-connect",
  createdAt: at,
  expiresAt: at,
};

function setup(answer: () => Response) {
  const requests: Request[] = [];
  const http = new HttpTransport({
    baseUrl: "https://host.invalid",
    fetch: vi.fn<typeof globalThis.fetch>(async (input, init) => {
      requests.push(new Request(input, init));
      return answer();
    }),
    getAccessToken: async () => "sample-token",
  });
  return { requests, routes: new HttpRouteClient(http, httpRoutes) };
}

describe("T3 Connect device approval of 0.1.10", () => {
  it("reads a device waiting on a pairing link and the devices an access snapshot trusts", () => {
    const waiting = AuthPairingLink.parse({
      ...link,
      connectDeviceRequest: { verificationCode: "ABCD-EFGH", client },
    });
    expect(waiting.connectDeviceRequest).toEqual({ verificationCode: "ABCD-EFGH", client });
    expect(AuthPairingLink.safeParse({ ...link, connectDeviceRequest: { client } }).success).toBe(
      false,
    );
    const device = {
      proofKeyThumbprint: "thumbprint-1",
      verificationCode: "ABCD-EFGH",
      client,
      approvedAt: at,
    };
    const snapshot = AuthAccessSnapshot.parse({
      pairingLinks: [waiting],
      clientSessions: [],
      connectDevices: [device],
    });
    expect(snapshot.connectDevices).toEqual([device]);
    expect(AuthAccessSnapshot.parse({ pairingLinks: [], clientSessions: [] })).not.toHaveProperty(
      "connectDevices",
    );
    expect(
      AuthAccessSnapshot.safeParse({
        pairingLinks: [],
        clientSessions: [],
        connectDevices: [{ ...device, approvedAt: undefined }],
      }).success,
    ).toBe(false);
  });

  it("approves a waiting device by its pairing link and revokes a trusted one by its key", async () => {
    const approve = setup(() => Response.json({ approved: true }));
    await expect(
      approve.routes.call("auth.approveConnectDevice", { body: { pairingLinkId: "link-1" } }),
    ).resolves.toEqual({ approved: true });
    const [approval] = approve.requests;
    expect(approval?.method).toBe("POST");
    expect(new URL(approval?.url ?? "").pathname).toBe("/api/auth/connect-devices/approve");
    expect(approval?.headers.get("authorization")).toBe("Bearer sample-token");
    await expect(approval?.json()).resolves.toEqual({ pairingLinkId: "link-1" });

    const revoke = setup(() => Response.json({ revoked: false }));
    await expect(
      revoke.routes.call("auth.revokeConnectDevice", {
        body: { proofKeyThumbprint: "thumbprint-1" },
      }),
    ).resolves.toEqual({ revoked: false });
    expect(new URL(revoke.requests[0]?.url ?? "").pathname).toBe(
      "/api/auth/connect-devices/revoke",
    );
  });

  it("refuses a request without the identifier before it is sent", async () => {
    const { requests, routes } = setup(() => Response.json({ approved: true }));
    await expect(
      routes.call("auth.approveConnectDevice", { body: { pairingLinkId: " " } }),
    ).rejects.toThrow();
    expect(requests).toEqual([]);
  });
});
