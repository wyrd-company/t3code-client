import { T3ConnectionError, type T3DecodeError } from "../errors.ts";
import type { StreamItem } from "../rpc/client.ts";

export type DecodedStreamItem<T> =
  | T
  | { readonly kind: "decode-error"; readonly error: T3DecodeError };

export function unwrapStreamItems<T>(
  source: AsyncIterable<StreamItem<T>>,
): AsyncIterable<DecodedStreamItem<T>> {
  return {
    async *[Symbol.asyncIterator]() {
      for await (const item of source) {
        yield item.kind === "item" ? item.value : item;
      }
    },
  };
}

/** The first decoded item; the stream is closed after it. `what` names the stream in the error. */
export async function firstItem<T>(
  source: AsyncIterable<DecodedStreamItem<T>>,
  what: string,
): Promise<T> {
  for await (const item of source) {
    if (typeof item === "object" && item !== null && "kind" in item && item.kind === "decode-error")
      throw item.error;
    return item as T;
  }
  throw new T3ConnectionError("protocol", `The ${what} stream ended before its first item.`);
}
