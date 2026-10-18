// ---
// relationships:
//   verifies: mcp
// ---
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import type { Client } from "@modelcontextprotocol/client";
import { connectMcp, call } from "../support/mcpClient.ts";
import { readCases, runCase } from "../protocol/runner.ts";
interface Pair {
  alpha: { url: string; workspace: string };
  beta: { url: string; workspace: string };
  env: Record<string, string>;
}
const pair = JSON.parse(process.env["MCP_LIVE_PAIR"] ?? "null") as Pair;
const agent = process.env["T3_LIVE_AGENT"] === "1";
let client: Client;
const subjects: { server: string; threadId: string }[] = [];
beforeAll(async () => {
  client = await connectMcp(pair.env);
});
afterAll(async () => {
  for (const ref of subjects) await call(client, "thread_interrupt", ref).catch(() => {});
  await client?.close();
});
async function selection(server: string) {
  const caps = await call(client, "server_capabilities", { server });
  const providers = caps["providers"] as {
    instanceId: string;
    driver: string;
    models: {
      slug: string;
      capabilities?: {
        optionDescriptors?: { id: string; type: string; options?: { id: string }[] }[];
      };
    }[];
  }[];
  if (!agent)
    return {
      instanceId: providers[0]!.instanceId,
      model: providers[0]!.models[0]?.slug ?? "sample-model",
    };
  const codex = providers.find((p) => p.driver === "codex" || p.instanceId === "codex");
  expect(codex, "Codex provider is available").toBeDefined();
  const model = codex!.models.find((m) => m.slug === "gpt-6-luna");
  expect(model, "gpt-6-luna is offered").toBeDefined();
  const effort = model!.capabilities?.optionDescriptors?.find(
    (o) => o.id === "reasoningEffort" && o.options?.some((v) => v.id === "low"),
  );
  return {
    instanceId: codex!.instanceId,
    model: "gpt-6-luna",
    ...(effort ? { options: [{ id: effort.id, value: "low" }] } : {}),
  };
}
async function launch(
  server: "alpha" | "beta",
  initialMessage?: string,
  clientRequestId = `sample-agent-${server}`,
) {
  const launched = await call(client, "thread_launch", {
    server,
    workspaceRoot: pair[server].workspace,
    title: "Sample verification",
    modelSelection: await selection(server),
    runtimeMode: "full-access",
    ...(initialMessage ? { clientRequestId } : {}),
    ...(initialMessage ? { initialMessage } : {}),
  });
  const ref = { server, threadId: launched["threadId"] as string };
  subjects.push(ref);
  return ref;
}
async function wait(threads: { server: string; threadId: string }[]) {
  for (let round = 0; round < 6; round++) {
    const result = await call(client, "thread_wait", { threads, until: "all", timeoutMs: 60_000 });
    if (!result["timedOut"]) {
      expect((result["threads"] as { status: string }[]).map((t) => t.status)).toEqual(
        threads.map(() => "completed"),
      );
      return result;
    }
  }
  throw new Error("Live subject did not finish within six waits.");
}
it("discovers two isolated servers, capabilities and projects", async () => {
  const list = await call(client, "server_list", { probe: true });
  expect(list["servers"]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ server: "alpha", reachable: true }),
      expect.objectContaining({ server: "beta", reachable: true }),
    ]),
  );
  for (const server of ["alpha", "beta"] as const) {
    expect(await call(client, "server_capabilities", { server })).toHaveProperty("providers");
    const project = await call(client, "project_ensure", {
      server,
      workspaceRoot: pair[server].workspace,
      title: "Sample",
    });
    expect(project["projectId"]).toBeTruthy();
    expect(await call(client, "project_list", { server })).toMatchObject({ server, total: 1 });
  }
});
it("launches idle threads idempotently, updates them and returns error codes", async () => {
  const modelSelection = await selection("alpha");
  const args = {
    server: "alpha",
    workspaceRoot: pair.alpha.workspace,
    modelSelection,
    clientRequestId: "sample-idle-launch",
  };
  const first = await call(client, "thread_launch", args);
  const second = await call(client, "thread_launch", args);
  expect(second["threadId"]).toBe(first["threadId"]);
  expect(second["resumed"]).toBe(true);
  const other = await connectMcp(pair.env);
  try {
    const concurrentArgs = { ...args, clientRequestId: "sample-concurrent-launch" };
    const results = await Promise.all([
      call(client, "thread_launch", concurrentArgs),
      call(other, "thread_launch", concurrentArgs),
    ]);
    expect(results[0]!["threadId"]).toBe(results[1]!["threadId"]);
    subjects.push({ server: "alpha", threadId: results[0]!["threadId"] as string });
  } finally {
    await other.close();
  }
  const ref = { server: "alpha", threadId: first["threadId"] as string };
  subjects.push(ref);
  for (const action of ["rename", "settle", "unsettle", "archive", "unarchive"]) {
    expect(
      await call(client, "thread_update", { ...ref, action, title: "Updated sample" }),
    ).toHaveProperty("action", action);
  }
  expect(await call(client, "thread_read", ref)).toMatchObject({
    server: "alpha",
    title: "Updated sample",
    status: "idle",
  });
  const missing = await client.callTool({
    name: "thread_read",
    arguments: { server: "alpha", threadId: "missing-thread" },
  });
  expect(missing.isError).toBe(true);
  expect(missing.structuredContent).toMatchObject({ error: { code: "not_found" } });
  const timeout = await call(client, "thread_wait", { threads: [ref], timeoutMs: 30 });
  expect(timeout["timedOut"]).toBe(true);
});
for (const spec of await readCases()) {
  it(`live protocol: ${spec.name}`, async () => {
    const c = await connectMcp(pair.env, spec.flags);
    try {
      const calls = spec.calls.filter((c) => c.code !== "auth_invalid");
      await runCase(c, { ...spec, calls });
      const authCases = spec.calls.filter((c) => c.code === "auth_invalid");
      if (authCases.length) {
        const unauthenticated = await connectMcp(
          { ...pair.env, ALPHA_TOKEN: "", BETA_TOKEN: "" },
          spec.flags,
        );
        try {
          await runCase(unauthenticated, { ...spec, calls: authCases });
        } finally {
          await unauthenticated.close();
        }
      }
    } finally {
      await c.close();
    }
  });
}
it.skipIf(!agent)(
  "runs Luna on both servers, waits across both, reads and sends a follow-up",
  async () => {
    const refs = [
      await launch("alpha", "Reply with exactly SAMPLE_ALPHA. Do not use tools."),
      await launch("beta", "Reply with exactly SAMPLE_BETA. Do not use tools."),
    ];
    await wait(refs);
    const reused = await call(client, "thread_launch", {
      server: "alpha",
      workspaceRoot: pair.alpha.workspace,
      modelSelection: await selection("alpha"),
      clientRequestId: "sample-agent-alpha",
      initialMessage: "SAMPLE_MUST_NOT_REPLAY",
    });
    expect(reused).toMatchObject({ threadId: refs[0]!.threadId, resumed: true });
    expect(JSON.stringify(await call(client, "thread_read", refs[0]!))).not.toContain(
      "SAMPLE_MUST_NOT_REPLAY",
    );
    for (const [index, ref] of refs.entries()) {
      expect(JSON.stringify(await call(client, "thread_read", ref))).toContain(
        index === 0 ? "SAMPLE_ALPHA" : "SAMPLE_BETA",
      );
    }
    await call(client, "thread_send", {
      ...refs[0],
      text: "Reply with exactly SAMPLE_FOLLOWUP. Do not use tools.",
    });
    await wait([refs[0]!]);
    const answer = await call(client, "thread_read", refs[0]!);
    expect(
      (answer["items"] as { type: string; text: string }[]).findLast(
        (i) => i.type === "assistant_message",
      )?.text,
    ).toContain("SAMPLE_FOLLOWUP");
  },
);
it.skipIf(!agent)("dispatches from an agent on alpha through its MCP tools to beta", async () => {
  const remoteModel = await selection("beta");
  const ref = await launch(
    "alpha",
    [
      "Use only tools from the MCP server named t3code-mcp. Do not use shell or other tools.",
      "Call server_list then server_capabilities with server beta.",
      `Call thread_launch on server beta with workspaceRoot ${JSON.stringify(pair.beta.workspace)}, modelSelection ${JSON.stringify(remoteModel)}, runtimeMode full-access, clientRequestId sample-remote-dispatch, and initialMessage: Reply with exactly SAMPLE_REMOTE_ANSWER. Do not use tools.`,
      "Retain the returned threadId. Call thread_wait with threads [{server:beta,threadId:<returned id>}], timeoutMs 45000. Repeat while timedOut. Then call thread_read on beta for that id.",
      "Report the remote assistant answer verbatim and its threadId. Do not claim success if a tool fails.",
    ].join("\n"),
    "sample-cross-server",
  );
  await wait([ref]);
  const result = await call(client, "thread_read", { ...ref, view: "activity", limit: 200 });
  const items = result["items"] as { type: string; text?: string; toolName?: string }[];
  const answer = items.findLast((item) => item.type === "assistant_message")?.text;
  expect(answer).toContain("SAMPLE_REMOTE_ANSWER");
  expect(
    items.some((item) => item.type === "dynamic_tool" && item.toolName?.includes("thread_launch")),
  ).toBe(true);
  // Independently prove the remote thread exists and actually completed.
  const remote = await call(client, "thread_list", {
    server: "beta",
    status: "completed",
    limit: 100,
  });
  const candidates = remote["items"] as { threadId: string }[];
  let verifiedThreadId: string | undefined;
  for (const candidate of candidates) {
    const read = await call(client, "thread_read", {
      server: "beta",
      threadId: candidate.threadId,
    });
    if (
      (read["items"] as { type: string; text: string }[]).some(
        (i) => i.type === "assistant_message" && i.text.includes("SAMPLE_REMOTE_ANSWER"),
      )
    )
      verifiedThreadId = candidate.threadId;
  }
  expect(verifiedThreadId).toBeDefined();
  expect(answer).toContain(verifiedThreadId!);
});
