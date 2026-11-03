// ---
// relationships:
//   implements: library-transport
// ---
/**
 * Reads a `text/event-stream` body and yields the data of each event. A comment, such as a
 * heartbeat, and each other field are skipped. An event that the body ends before is not yielded.
 * Ending the iteration cancels the body.
 */
const LINE_BREAK = /\r\n|\r(?=[^\n])|\n/u;

export async function* serverSentEventData(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      for (let match = LINE_BREAK.exec(buffer); match; match = LINE_BREAK.exec(buffer)) {
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (line === "" && data.length > 0) {
          yield data.join("\n");
          data = [];
        } else if (line.startsWith("data:")) {
          data.push(line.slice(line.startsWith("data: ") ? 6 : 5));
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
