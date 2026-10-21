/** Minimal structured logger: one JSON object per line on stdout, picked up by Docker's json-file driver. */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

export function createLogger(
  sink: (line: string) => void = (line) => process.stdout.write(line + "\n"),
): Logger {
  const emit = (level: LogLevel, msg: string, fields?: LogFields) =>
    sink(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }));
  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) {
    return { error: err.message, stack: err.stack };
  }
  return { error: String(err) };
}
