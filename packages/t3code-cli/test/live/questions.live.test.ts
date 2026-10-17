// ---
// relationships:
//   verifies: command-line
//   references: command-line
// ---
import { expect, it } from "vite-plus/test";
import { pendingRequests, providerInstanceId, type ThreadId } from "@wyrd-company/t3code-lib";
import { agent, cli, client, ownedThreads, record, useDispatchHarness } from "./dispatchHarness.ts";

useDispatchHarness("questions");
async function questionFor(id: ThreadId) {
  for await (const item of client.threads.watch(id, { signal: AbortSignal.timeout(45_000) })) {
    const requests =
      item.kind === "snapshot"
        ? pendingRequests(item.snapshot.projection)
        : item.kind === "user-input-requested"
          ? [{ ...item, kind: "user-input" as const }]
          : [];
    const question = requests.find((request) => request.kind === "user-input");
    if (question?.kind === "user-input") return question;
  }
  throw new Error("No user-input request observed.");
}

it.skipIf(!agent)(
  "leaves real questions unanswered under approval policies and accepts an explicit answer",
  async () => {
    const { projectId } = await client.projects.ensureScratch();
    for (const policy of ["default", "accept", "reject", "wait"]) {
      const thread = await client.threads.create({
        projectId,
        title: "Sample question",
        interactionMode: "plan",
        modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
      });
      ownedThreads.add(thread.id);
      const running = cli([
        "run",
        "Use request_user_input to ask which generic color to use: blue or green. Wait for the answer. Do not choose a color yourself. After the answer reply SAMPLE only.",
        "--thread",
        thread.id,
        ...(policy === "accept" || policy === "reject" ? ["--approve", policy] : []),
        ...(policy === "wait" ? ["--on-request", "wait"] : []),
        "--json",
        "--timeout",
        "60s",
        "--on-timeout",
        "detach",
      ]);
      if (policy !== "wait") {
        const blocked = await running;
        record({ case: `question policy ${policy}`, threadId: thread.id, ...blocked });
        expect(blocked.exit).toBe(7);
      }
      const question = await questionFor(thread.id);
      const key = question.questions[0]!.id;
      // Pending state is real and remains unresolved until this explicit response.
      expect(pendingRequests(await client.threads.projection(thread.id))).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ requestId: question.requestId, kind: "user-input" }),
        ]),
      );
      const response = await cli([
        "thread",
        "respond",
        thread.id,
        "--request",
        question.requestId,
        "--answer",
        `${key}=blue`,
        "--json",
      ]);
      record({
        case: "explicit question response",
        policy,
        threadId: thread.id,
        requestId: question.requestId,
        ...response,
      });
      expect(response.exit).toBe(0);
      const completed =
        policy === "wait"
          ? await running
          : await cli(["thread", "wait", thread.id, "--json", "--timeout", "60s"]);
      record({ case: "answered wait", policy, threadId: thread.id, ...completed });
      expect(completed.exit).toBe(0);
      expect(JSON.parse(completed.stdout)).toMatchObject({
        state: "completed",
        assistantMessage: "SAMPLE",
      });
      expect(await client.threads.pendingRequests(thread.id)).toEqual([]);
    }
  },
);
