// ---
// relationships:
//   implements: design
// ---
/**
 * Pull request link identity, as upstream's `@t3tools/shared`
 * `threadPullRequests` keys it: host and repository compare case-insensitively,
 * a Forgejo link keeps the port its URL names, and Azure DevOps remotes fold
 * to one `dev.azure.com/org/project/_git/repo` form. A thread that predates
 * `pullRequests` reads its single `linkedPullRequest` as a one-link list.
 * No I/O.
 */
import type {
  ThreadLinkedPullRequest,
  ThreadPullRequestKey,
  ThreadPullRequestLink,
} from "../schemas/orchestration/pullRequest.ts";

type KeySource = ThreadPullRequestKey & { readonly url?: string };

interface ChangeRequestLink extends ThreadPullRequestKey {
  /** Forgejo's HTTP host and port, separate from the portless repository identity. */
  readonly authority?: string;
}

/** The thread's links; an older thread's single legacy link becomes a one-link list. */
export function threadPullRequestsOf(thread: {
  readonly pullRequests?: readonly ThreadPullRequestLink[] | undefined;
  readonly linkedPullRequest?: ThreadLinkedPullRequest | null | undefined;
}): readonly ThreadPullRequestLink[] {
  if (thread.pullRequests !== undefined) return thread.pullRequests;
  const linked = thread.linkedPullRequest;
  return linked == null
    ? []
    : [
        {
          ...legacyKey(linked),
          url: linked.url,
          source: "manual",
          linkedAt: "1970-01-01T00:00:00.000Z",
          snapshot: null,
          stack: null,
        },
      ];
}

export function pullRequestKeysEqual(left: KeySource, right: KeySource): boolean {
  return keyString(left) === keyString(right);
}

function keyString(key: KeySource): string {
  const normalized = normalizeKey(key);
  return `${normalized.host}/${normalized.repository}#${normalized.number}`;
}

function normalizeKey(key: KeySource): ThreadPullRequestKey {
  const parsed = key.url === undefined ? null : parseChangeRequestUrl(key.url);
  const authority =
    parsed?.repository === key.repository.trim().toLowerCase() && parsed.number === key.number
      ? parsed.authority
      : undefined;
  const canonical = canonicalRepositoryKey(
    `${(authority ?? key.host).trim().toLowerCase()}/${key.repository.trim().toLowerCase()}`,
  );
  const separator = canonical.indexOf("/");
  return {
    host: canonical.slice(0, separator),
    repository: canonical.slice(separator + 1),
    number: key.number,
  };
}

/** Legacy Azure selectors omit the organization and project; the PR URL has them. */
function legacyKey(linked: ThreadLinkedPullRequest): ThreadPullRequestKey {
  const parsed = parseChangeRequestUrl(linked.url);
  if (parsed !== null && parsed.number === linked.number) {
    const canonical = canonicalRepositoryKey(`${parsed.host}/${parsed.repository}`);
    if (parsed.authority !== undefined || canonical.startsWith("dev.azure.com/")) {
      return normalizeKey(parsed);
    }
  }
  let host: string;
  try {
    host = new URL(linked.url).hostname;
  } catch {
    host = "unknown";
  }
  return {
    host: host.trim().toLowerCase() || "unknown",
    repository: linked.repository.trim().toLowerCase(),
    number: linked.number,
  };
}

function canonicalRepositoryKey(key: string): string {
  return key
    .replace(
      /^(?:ssh\.dev\.azure\.com|vs-ssh\.visualstudio\.com)\/v3\/([^/]+)\/([^/]+)\/([^/]+)$/u,
      "dev.azure.com/$1/$2/_git/$3",
    )
    .replace(
      /^([^.]+)\.visualstudio\.com\/(?:defaultcollection\/)?([^/]+)\/_git\/([^/]+)$/u,
      "dev.azure.com/$1/$2/_git/$3",
    );
}

/** The host itself, one of its subdomains, or an install named after the provider. */
function isHostOf(hostname: string, apex: string, label?: string): boolean {
  if (hostname === apex || hostname.endsWith(`.${apex}`)) return true;
  return label !== undefined && hostname.split(".").includes(label);
}

/** The repository and number behind a change request URL, or null when the URL is not one. */
function parseChangeRequestUrl(targetUrl: string): ChangeRequestLink | null {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "git.cafe" || host === "staging.git.cafe") {
    return claim(host, /^\/([^/]+\/[^/]+)\/pulls\/(\d+)(?:\/|$)/u.exec(url.pathname));
  }
  if (isHostOf(host, "github.com", "github")) {
    const match = /^\/([^/]+\/[^/]+)\/pull\/(\d+)(?:\/|$)/u.exec(url.pathname);
    if (match) return claim(host, match);
  }
  const forgejo = /^\/([^/]+(?:\/[^/]+)+)\/pulls\/(\d+)(?:\/|$)/u.exec(url.pathname);
  if (forgejo) {
    const link = claim(host, forgejo);
    return link === null ? null : { ...link, authority: url.host.toLowerCase() };
  }
  const gitlab = /^\/([^/]+(?:\/[^/]+)+)\/-\/merge_requests\/(\d+)(?:\/|$)/u.exec(url.pathname);
  if (gitlab) return claim(host, gitlab);
  if (isHostOf(host, "bitbucket.org", "bitbucket")) {
    return claim(host, /^\/([^/]+\/[^/]+)\/pull-requests\/(\d+)(?:\/|$)/u.exec(url.pathname));
  }
  if (isHostOf(host, "dev.azure.com") || host.endsWith(".visualstudio.com")) {
    return claim(
      host,
      /^\/((?:[^/]+\/)*_git\/[^/]+)\/pullrequest\/(\d+)(?:\/|$)/u.exec(url.pathname),
    );
  }
  return null;
}

function claim(host: string, match: RegExpExecArray | null): ChangeRequestLink | null {
  const repository = match?.[1];
  const number = Number(match?.[2]);
  return repository && Number.isSafeInteger(number) && number > 0
    ? { host, repository: repository.toLowerCase(), number }
    : null;
}
