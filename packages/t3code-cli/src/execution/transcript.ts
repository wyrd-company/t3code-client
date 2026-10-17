// ---
// relationships:
//   implements: command-contract
// ---
import { T3HttpError, threadId as toThreadId, type T3Client } from "@wyrd-company/t3code-lib";

export interface ConversationItem {
  role: "user" | "assistant";
  kind: "user_message" | "assistant_message";
  text: string;
}

/** Both reads use the server's visible timeline, including inherited conversation rows. */
export async function readConversation(
  client: T3Client,
  threadId: string,
  signal?: AbortSignal,
): Promise<ConversationItem[]> {
  const id = toThreadId(threadId);
  let rows;
  try {
    rows = (await client.threads.transcript(id, signal)).items;
  } catch (error) {
    if (!(error instanceof T3HttpError) || error.reason !== "thread_transcript_too_large")
      throw error;
    rows = (await client.threads.detail(id, signal)).projection.visibleTurnItems;
  }
  return rows.flatMap(({ item }): ConversationItem[] => {
    if (item.type === "user_message") return [{ role: "user", kind: item.type, text: item.text }];
    if (item.type === "assistant_message")
      return [{ role: "assistant", kind: item.type, text: item.text }];
    return [];
  });
}

export function lastAssistantMessage(items: readonly ConversationItem[]): string | null {
  return items.findLast((item) => item.role === "assistant")?.text ?? null;
}
