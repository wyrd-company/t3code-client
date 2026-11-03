// A local ACP agent for the live tests. It speaks newline-delimited JSON-RPC on
// stdio, reaches nothing outside the process and appends each request to the file
// named by its first argument, so a test can read what the server sent.
import * as NodeFS from "node:fs";
import * as NodeReadline from "node:readline";

const log = process.argv[2];
const refusedProvider = "sample-refused";
const sessions = [{ sessionId: "sample-session", cwd: process.cwd(), title: "Sample session" }];
const providers = new Map([
  ["main", { apiType: "openai", baseUrl: "https://example.invalid/v1" }],
  [refusedProvider, null],
]);

const results = {
  initialize: () => ({
    protocolVersion: 2,
    agentInfo: { name: "sample-agent", version: "1.0.0" },
    agentCapabilities: {
      loadSession: false,
      providers: {},
      auth: { logout: {} },
      sessionCapabilities: { list: {}, delete: {}, resume: {}, close: {} },
    },
    authMethods: [],
  }),
  "session/new": () => ({ sessionId: "sample-probe" }),
  "session/list": () => ({ sessions, nextCursor: null }),
  "session/delete": ({ sessionId }) => {
    const index = sessions.findIndex((session) => session.sessionId === sessionId);
    if (index >= 0) sessions.splice(index, 1);
    return {};
  },
  "session/resume": () => ({}),
  "session/close": () => ({}),
  "auth/logout": () => ({}),
  "providers/list": () => ({
    providers: [...providers].map(([providerId, current]) => ({
      providerId,
      supported: ["openai"],
      required: false,
      current,
    })),
  }),
  "providers/set": ({ providerId, apiType, baseUrl }) => {
    providers.set(providerId, { apiType, baseUrl });
    return {};
  },
  "providers/disable": ({ providerId }) => {
    providers.set(providerId, null);
    return {};
  },
};

// The server starts a new process for each management call, so state comes from the log.
for (const line of NodeFS.readFileSync(log, "utf8").split("\n").filter(Boolean)) {
  const { method, params } = JSON.parse(line);
  const replayed = method.startsWith("session/delete") || method.startsWith("providers/");
  if (replayed && params?.providerId !== refusedProvider) {
    results[method]?.(params ?? {});
  }
}

NodeReadline.createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, method, params } = JSON.parse(line);
  if (method === undefined) return;
  NodeFS.appendFileSync(log, `${JSON.stringify({ method, params })}\n`);
  if (id === undefined) return;
  if (params?.providerId === refusedProvider) {
    // A failure that quotes its request, as an agent's diagnostic can.
    const error = { code: -32603, message: "Refused.", data: { headers: params.headers } };
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error })}\n`);
    return;
  }
  const handler = results[method];
  const reply = handler
    ? { result: handler(params ?? {}) }
    : { error: { code: -32601, message: `Method not found: ${method}` } };
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, ...reply })}\n`);
});
