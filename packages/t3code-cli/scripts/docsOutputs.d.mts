// ---
// relationships:
//   implements: documentation
// ---
import type { ReferencePage } from "./docsProjection.mjs";
export function syncReference(
  directory: string,
  pages: readonly Pick<ReferencePage, "filename" | "content">[],
  check?: boolean,
): Promise<void>;
