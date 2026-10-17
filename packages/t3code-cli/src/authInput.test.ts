// ---
// relationships:
//   verifies: command-contract
// ---
import { expect, it, vi } from "vite-plus/test";
import { pairInput } from "./authInput.ts";

it.each([
  "https://server.example/pair#token=sample%2Btoken",
  "https://server.example/?token=sample%2Btoken",
])("accepts pairing link %s and defaults name to host", async (link) => {
  expect(await pairInput(link, {})).toEqual({
    name: "server.example",
    url: "https://server.example",
    token: "sample+token",
    session: false,
  });
});
it("reads only the explicit stdin source and preserves split token contents", async () => {
  const stdin = vi.fn(async () => "sample-token\n");
  expect(
    await pairInput(
      undefined,
      { server: "http://server.example:123/pair", pairingTokenStdin: true, name: "sample" },
      stdin,
    ),
  ).toEqual({
    name: "sample",
    url: "http://server.example:123",
    token: "sample-token",
    session: false,
  });
  expect(
    await pairInput(undefined, { server: "https://server.example", tokenStdin: true }, stdin),
  ).toMatchObject({ session: true, token: "sample-token" });
  expect(
    await pairInput(
      undefined,
      { server: "https://server.example", pairingToken: " sample-token " },
      stdin,
    ),
  ).toMatchObject({ token: " sample-token " });
  expect(stdin).toHaveBeenCalledTimes(2);
});
it.each([
  [undefined, {}],
  ["", {}],
  ["not-a-url", {}],
  ["ftp://server.example/pair#token=x", {}],
  ["https://server.example/pair", {}],
  ["https://server.example/wrong#token=x", {}],
  ["https://server.example/pair?token=x#token=y", {}],
  ["https://server.example/pair#token=x", { pairingToken: "x" }],
  [undefined, { pairingTokenStdin: true }],
  [undefined, { server: "ftp://server.example", tokenStdin: true }],
  [undefined, { pairingToken: "x" }],
  [undefined, { server: "https://server.example", pairingToken: "" }],
  [undefined, { server: "https://server.example", pairingToken: " " }],
  [undefined, { server: "https://server.example", pairingToken: "x", tokenStdin: true }],
  [undefined, { server: "https://server.example", pairingToken: "x", name: "" }],
] as const)(
  "rejects invalid or conflicting pair inputs before reading stdin (%s)",
  async (link, options) => {
    const stdin = vi.fn(async () => "sample");
    await expect(pairInput(link, options, stdin)).rejects.toMatchObject({ code: "precondition" });
    expect(stdin).not.toHaveBeenCalled();
  },
);
it("rejects empty explicit stdin", async () => {
  await expect(
    pairInput(undefined, { server: "https://server.example", tokenStdin: true }, async () => " \n"),
  ).rejects.toMatchObject({ code: "precondition" });
});
