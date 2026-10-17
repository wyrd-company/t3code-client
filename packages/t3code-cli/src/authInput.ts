// ---
// relationships:
//   implements: command-line
// ---
import { T3PreconditionError } from "@wyrd-company/t3code-lib";

export interface PairInput {
  name: string;
  url: string;
  token: string;
  session: boolean;
}

/** Validate source presence before consuming stdin or contacting a server. */
export async function pairInput(
  link: string | undefined,
  options: Record<string, unknown>,
  stdin: () => Promise<string> = readToken,
): Promise<PairInput> {
  const sources = [
    link !== undefined,
    options["pairingToken"] !== undefined,
    options["pairingTokenStdin"] === true,
    options["tokenStdin"] === true,
  ];
  if (sources.filter(Boolean).length !== 1) throw invalid();
  let url: URL;
  let token: string;
  try {
    if (link !== undefined) {
      url = new URL(link);
      const fragment = new URLSearchParams(url.hash.slice(1)).get("token");
      const query = url.searchParams.get("token");
      if ((fragment !== null && query !== null) || (fragment !== null && url.pathname !== "/pair"))
        throw invalid();
      token = fragment ?? query ?? "";
    } else {
      if (typeof options["server"] !== "string") throw invalid();
      url = new URL(options["server"]);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw invalid();
      token =
        options["pairingToken"] !== undefined
          ? String(options["pairingToken"])
          : (await stdin()).trim();
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw invalid();
  } catch {
    throw invalid();
  }
  if (!token.trim()) throw invalid();
  const name = options["name"] === undefined ? url.host : String(options["name"]);
  if (!name.length) throw invalid();
  return { name, url: url.origin, token, session: options["tokenStdin"] === true };
}

async function readToken(): Promise<string> {
  // Consume stdin only for an explicitly selected input source; no interactive prompt.
  process.stdin.setEncoding("utf8");
  let text = "";
  for await (const chunk of process.stdin) text += String(chunk);
  return text;
}
function invalid(): T3PreconditionError {
  return new T3PreconditionError("Supply one pairing link or an explicit server and token source.");
}
