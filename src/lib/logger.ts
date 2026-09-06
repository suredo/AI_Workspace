type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLogLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "warn" : "debug");
  const env = raw.toLowerCase();
  if (env in LOG_LEVELS) return env as LogLevel;
  return "debug";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getMinLogLevel()];
}

function log(level: LogLevel, context: string, message: string, data?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const timestamp = new Date().toISOString();
  const entry: Record<string, unknown> = { timestamp, level, context, message, ...(data ?? {}) };

  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (context: string, message: string, data?: Record<string, unknown>) =>
    log("debug", context, message, data),
  info: (context: string, message: string, data?: Record<string, unknown>) =>
    log("info", context, message, data),
  warn: (context: string, message: string, data?: Record<string, unknown>) =>
    log("warn", context, message, data),
  error: (context: string, message: string, data?: Record<string, unknown>) =>
    log("error", context, message, data),
};
