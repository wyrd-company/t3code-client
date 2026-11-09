// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { schemas } from "../../index.ts";
import { OrchestrationV2GetNativeChildWorkResult } from "./nativeChildWork.ts";

describe("OrchestrationV2GetNativeChildWorkResult", () => {
  it("keeps steps, a missing transcript and unknown fields", () => {
    const result = OrchestrationV2GetNativeChildWorkResult.parse({
      children: [
        {
          conversationId: "conversation-1",
          role: "researcher",
          prompt: "Summarize the sample file.",
          steps: [
            {
              index: 0,
              type: "tool",
              status: null,
              text: null,
              toolCalls: [{ name: "read_file", input: '{"path":"sample.txt"}' }],
              futureField: true,
            },
          ],
          truncated: true,
        },
        {
          conversationId: "conversation-2",
          role: "",
          prompt: "",
          steps: null,
          truncated: false,
        },
      ],
    });
    expect(result.children[0]?.steps?.[0]).toMatchObject({
      futureField: true,
      status: null,
    });
    expect(result.children[1]?.steps).toBeNull();
  });

  it("accepts no children and refuses a step with a negative index", () => {
    expect(OrchestrationV2GetNativeChildWorkResult.parse({ children: [] })).toEqual({
      children: [],
    });
    const badStep = {
      index: -1,
      type: "text",
      status: null,
      text: "",
      toolCalls: [],
    };
    expect(
      OrchestrationV2GetNativeChildWorkResult.safeParse({
        children: [
          {
            conversationId: "c",
            role: "r",
            prompt: "p",
            steps: [badStep],
            truncated: false,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("is exported through the package's schemas namespace", () => {
    const exported = schemas.orchestrationNativeChildWork;
    expect(exported.OrchestrationV2GetNativeChildWorkResult).toBe(
      OrchestrationV2GetNativeChildWorkResult,
    );
    expect(
      exported.OrchestrationV2GetNativeChildWorkInput.parse({
        threadId: "thread-1",
      }),
    ).toEqual({ threadId: "thread-1" });
  });
});
