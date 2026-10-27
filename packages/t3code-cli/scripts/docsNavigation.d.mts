// ---
// relationships:
//   implements: documentation
// ---
import type { ReferencePage } from "./docsProjection.mjs";
export function syncNavigation(
  path: string,
  pages: readonly Pick<ReferencePage, "filename" | "group">[],
  check?: boolean,
): Promise<void>;
