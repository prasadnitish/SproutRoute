import { log, errorFields } from "./logger.js";

// Last-resort Express error middleware: log with context, answer with the v1 envelope, never echo the message.
export function createErrorHandler({ logger = log } = {}) {
  return (err, req, res, next) => {
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    const serverFault = status >= 500;
    logger[serverFault ? "error" : "warn"]("request:error", {
      reqId: req.reqId,
      method: req.method,
      path: req.path,
      status,
      ...errorFields(err),
    });
    if (res.headersSent) return next(err);
    res.status(status).json({
      code: serverFault ? "INTERNAL_ERROR" : "BAD_REQUEST",
      message: serverFault ? "Something went wrong. Please try again." : "The request could not be processed.",
      category: serverFault ? "server" : "validation",
      retryable: serverFault,
      requestId: req.reqId,
    });
  };
}
