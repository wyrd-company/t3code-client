import { T3AuthError, T3HttpError, T3NotFoundError, type T3HttpErrorDetails } from "../errors.ts";

/** A body as JSON, or as its text when it is not JSON. An empty body is `undefined`. */
export function parseBody(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** The error of a non-2xx answer. */
export function httpError(
  status: number,
  method: string,
  path: string,
  body: unknown,
): T3HttpError {
  const record = asRecord(body);
  const tag = stringField(record, "_tag");
  const reason = stringField(record, "reason") ?? stringField(record, "error");
  const traceId = stringField(record, "traceId");
  const requiredScope = stringField(record, "requiredScope");
  const details: T3HttpErrorDetails = {
    status,
    method,
    path,
    body,
    ...(tag === undefined ? {} : { tag }),
    ...(reason === undefined ? {} : { reason }),
    ...(traceId === undefined ? {} : { traceId }),
  };
  const message = `${method} ${path} failed with HTTP ${status}${reason ? ` (${reason})` : ""}.`;
  if (status === 401) return new T3AuthError(message, { ...details, code: "auth_invalid" });
  if (status === 403) {
    return new T3AuthError(message, {
      ...details,
      code: "insufficient_scope",
      ...(requiredScope === undefined ? {} : { requiredScope }),
    });
  }
  if (status === 404) return new T3NotFoundError(message, details);
  return new T3HttpError(message, details);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}
