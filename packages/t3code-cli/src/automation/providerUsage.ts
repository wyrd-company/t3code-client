// ---
// relationships:
//   implements: command-line
// ---
import {
  T3NotFoundError,
  T3PreconditionError,
  type T3Client,
  type UsageSummary,
  type UsageSummaryInput,
} from "@wyrd-company/t3code-lib";
import type { InvocationHandler } from "../main.ts";

type ServerProvider = Awaited<ReturnType<T3Client["server"]["providers"]>>[number];

function providerText(provider: ServerProvider): string {
  const head = [
    provider.instanceId,
    provider.driver,
    provider.enabled ? "enabled" : "disabled",
    provider.installed ? "installed" : "missing",
    provider.status,
    provider.availability ?? "-",
    `auth ${provider.auth.status}`,
    provider.version ?? "-",
  ].join("\t");
  const limits = provider.usageLimits;
  const lines = [head];
  if (limits?.unavailable) lines.push(`  usage\tunavailable\t${limits.unavailable.reason}`);
  for (const window of limits?.windows ?? [])
    lines.push(`  usage\t${window.label}\t${window.usedPercent}%\t${window.resetsAt ?? "-"}`);
  if (limits?.resetCredits) lines.push(`  resetCredits\t${limits.resetCredits.availableCount}`);
  return lines.join("\n");
}

const providerStatus: InvocationHandler = async ([instance], _command, invocation) => {
  if (instance !== undefined && !instance.trim())
    throw new T3PreconditionError("A provider instance id cannot be blank.");
  const data = await (await invocation.client()).server.providerStatus(instance);
  if (instance !== undefined && data.length === 0)
    throw new T3NotFoundError("Selected provider not found.", {
      status: 404,
      method: "LOCAL",
      path: "provider",
      body: undefined,
    });
  invocation.output.finish({ data, exitCode: 0 }, data.map(providerText).join("\n"));
};

function calendarDay(value: unknown, flag: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
  const date = match ? new Date(`${text}T00:00:00.000Z`) : undefined;
  if (!date || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== text)
    throw new T3PreconditionError(`${flag} must be a calendar day as YYYY-MM-DD.`);
  return text;
}

function timeZone(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  try {
    if (text && !/^[+-]/u.test(text)) {
      new Intl.DateTimeFormat("en-US", { timeZone: text }).resolvedOptions();
      return text;
    }
  } catch {
    // An unknown zone is the caller's input error.
  }
  throw new T3PreconditionError("--time-zone must be an IANA time zone, such as Etc/UTC.");
}

/** Builds the summary input; every check runs before connecting. */
export function usageInput(options: Record<string, unknown>): UsageSummaryInput {
  const sinceDay = calendarDay(options["sinceDay"], "--since-day");
  const untilDay = calendarDay(options["untilDay"], "--until-day");
  if (sinceDay > untilDay)
    throw new T3PreconditionError("--since-day must not be after --until-day.");
  const optional = (key: string, flag: string) => {
    const value = options[key];
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !value.trim())
      throw new T3PreconditionError(`${flag} cannot be blank.`);
    return value.trim();
  };
  const sinceTime = optional("sinceTime", "--since-time");
  const untilTime = optional("untilTime", "--until-time");
  const resolution = options["resolution"] as UsageSummaryInput["resolution"];
  if (resolution === "hour") {
    const start = sinceTime === undefined ? NaN : Date.parse(sinceTime);
    const end = untilTime === undefined ? NaN : Date.parse(untilTime);
    // Stock UsageService: hourly windows require valid instants, >0 and <=24 hours.
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end - start > 86_400_000
    )
      throw new T3PreconditionError(
        "Hourly usage needs valid --since-time and --until-time instants spanning at most 24 hours.",
      );
  }
  return {
    sinceDay: sinceDay as UsageSummaryInput["sinceDay"],
    untilDay: untilDay as UsageSummaryInput["untilDay"],
    timeZone: timeZone(options["timeZone"]),
    ...(resolution === undefined ? {} : { resolution }),
    ...(sinceTime === undefined ? {} : { sinceTime }),
    ...(untilTime === undefined ? {} : { untilTime }),
    ...(options["awaitRefresh"] === true ? { awaitRefresh: true } : {}),
  };
}

/** One line per bucket and source; incompatible counters are never totaled. */
function usageText(summary: UsageSummary): string {
  const buckets = summary.buckets.map((bucket) => {
    const totals = bucket.totals;
    return [
      bucket.hourStart ?? bucket.day,
      bucket.provider,
      bucket.model,
      `input ${totals.uncachedInputTokens}`,
      `cached ${totals.cachedInputTokens}`,
      `cacheWrite ${totals.cacheCreationTokens}`,
      `output ${totals.outputTokens}`,
      `reasoning ${totals.reasoningTokens}`,
      `${bucket.costUsd} USD`,
      bucket.costSource,
    ].join("\t");
  });
  const sources = summary.sources.map((source) =>
    [
      "source",
      source.fingerprint.provider,
      source.status,
      `${source.scannedFiles} files`,
      `${source.distinctSessions} sessions`,
      ...(source.refreshing ? ["refreshing"] : []),
    ].join("\t"),
  );
  return [...buckets, ...sources, `pricing\t${summary.pricing.status}`].join("\n");
}

const usageSummary: InvocationHandler = async (_, command, invocation) => {
  const input = usageInput(command.optsWithGlobals());
  const data = await (await invocation.client()).server.usageSummary(input);
  invocation.output.finish({ data, exitCode: 0 }, usageText(data));
};

export const providerUsageHandlers: Record<string, InvocationHandler> = {
  "provider status": providerStatus,
  "usage summary": usageSummary,
};
