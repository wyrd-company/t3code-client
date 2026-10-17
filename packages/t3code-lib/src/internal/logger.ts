// ---
// relationships:
//   implements: design
// ---
/** Optional logging seam. The default logger discards everything. */
export interface Logger {
  /** Write a diagnostic message. */
  debug(message: string, data?: Record<string, unknown>): void;
  /** Write an informational message. */
  info(message: string, data?: Record<string, unknown>): void;
  /** Write a warning. */
  warn(message: string, data?: Record<string, unknown>): void;
  /** Write a failure message. */
  error(message: string, data?: Record<string, unknown>): void;
}

export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/** Create a logger that writes prefixed messages to the Node console. */
export function consoleLogger(prefix = "t3code-client"): Logger {
  const line = (level: string, message: string, data?: Record<string, unknown>) =>
    data
      ? `[${prefix}] ${level} ${message} ${JSON.stringify(data)}`
      : `[${prefix}] ${level} ${message}`;
  return {
    debug: (m, d) => console.debug(line("debug", m, d)),
    info: (m, d) => console.info(line("info", m, d)),
    warn: (m, d) => console.warn(line("warn", m, d)),
    error: (m, d) => console.error(line("error", m, d)),
  };
}
