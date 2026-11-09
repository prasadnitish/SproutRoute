// Lightweight structured logger for production visibility.
// Logs JSON in production for Railway log parsing, human-readable in dev.
// No external dependencies — just console with consistent format.

import { AsyncLocalStorage } from "node:async_hooks";

// Holds { reqId } for the request being served, so any log line written during it carries the id.
export const requestContext = new AsyncLocalStorage();

const IS_PROD = process.env.NODE_ENV === "production";
const IS_TEST = process.env.NODE_ENV === "test";

function formatMessage(level, message, ownMeta = {}) {
  if (IS_TEST) return; // Silent in tests
  const meta = { ...requestContext.getStore(), ...ownMeta };

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  };

  if (IS_PROD) {
    // Structured JSON for Railway log parsing
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
      JSON.stringify(entry),
    );
  } else {
    // Human-readable for local dev
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
      `[${entry.ts}] ${level.toUpperCase()} ${message}${metaStr}`,
    );
  }
}

export const log = {
  info: (msg, meta) => formatMessage("info", msg, meta),
  warn: (msg, meta) => formatMessage("warn", msg, meta),
  error: (msg, meta) => formatMessage("error", msg, meta),

  // Request-scoped helper: prepends requestId to all log calls
  withRequestId(requestId) {
    return {
      info: (msg, meta) => formatMessage("info", msg, { requestId, ...meta }),
      warn: (msg, meta) => formatMessage("warn", msg, { requestId, ...meta }),
      error: (msg, meta) => formatMessage("error", msg, { requestId, ...meta }),
    };
  },
};

// Error context for log lines: name, code and a short stack, not only the message.
export function errorFields(err) {
  return {
    error: err?.message ?? String(err),
    errorName: err?.name,
    errorCode: err?.code,
    stack: typeof err?.stack === "string" ? err.stack.split("\n").slice(0, 8).join("\n") : undefined,
  };
}
