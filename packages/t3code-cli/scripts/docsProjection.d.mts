// ---
// relationships:
//   implements: documentation
// ---
export interface ReferencePage {
  readonly filename: string;
  readonly title: string;
  readonly group: string;
  readonly order: number;
  readonly content: string;
}
export const generatedMarker: string;
export function rewriteLinks(
  body: string,
  filename: string,
  owners: ReadonlyMap<string, string>,
): string;
export function projectReference(content: string, maxLines?: number): ReferencePage[];
