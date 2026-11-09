import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createErrorHandler } from "../../src/backend/utils/errorHandler.js";
import { installProcessHandlers, installShutdownHandler } from "../../src/backend/utils/processHandlers.js";

function recorder() {
  const calls = [];
  return {
    calls,
    error: (msg, meta) => calls.push({ level: "error", msg, meta }),
    warn: (msg, meta) => calls.push({ level: "warn", msg, meta }),
  };
}

function fakeRes({ headersSent = false } = {}) {
  return {
    headersSent,
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

const req = { reqId: "abc123", method: "POST", path: "/api/v1/trip/plan" };

test("an unexpected error is logged with its stack and answered with the v1 envelope, without leaking the message", () => {
  const logger = recorder();
  const res = fakeRes();
  createErrorHandler({ logger })(new Error("db password is hunter2"), req, res, () => assert.fail("next called"));

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please try again.",
    category: "server",
    retryable: true,
    requestId: "abc123",
  });
  assert.equal(logger.calls[0].level, "error");
  assert.equal(logger.calls[0].msg, "request:error");
  assert.equal(logger.calls[0].meta.reqId, "abc123");
  assert.equal(logger.calls[0].meta.path, "/api/v1/trip/plan");
  assert.match(logger.calls[0].meta.stack, /errorHandling\.test\.js/);
});

test("a client error such as a body-parser failure keeps its status and logs a warning", () => {
  const logger = recorder();
  const res = fakeRes();
  const parseError = Object.assign(new SyntaxError("Unexpected token"), { status: 400 });
  createErrorHandler({ logger })(parseError, req, res, () => assert.fail("next called"));

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "BAD_REQUEST");
  assert.equal(res.body.retryable, false);
  assert.equal(logger.calls[0].level, "warn");
});

test("when a response has already started the error is handed back to Express to close the connection", () => {
  const logger = recorder();
  const res = fakeRes({ headersSent: true });
  const err = new Error("mid-stream");
  let passed;
  createErrorHandler({ logger })(err, req, res, (e) => { passed = e; });

  assert.equal(passed, err);
  assert.equal(res.statusCode, null);
  assert.equal(logger.calls.length, 1);
});

test("an unhandled rejection is logged and the process keeps running", () => {
  const logger = recorder();
  const proc = new EventEmitter();
  let exited = null;
  installProcessHandlers({ proc, logger, exit: (code) => { exited = code; } });

  proc.emit("unhandledRejection", new RangeError("lost promise"));

  assert.equal(logger.calls[0].msg, "process:unhandled-rejection");
  assert.equal(logger.calls[0].meta.errorName, "RangeError");
  assert.equal(exited, null);
});

test("an uncaught exception is logged and then the process exits so Railway restarts it", () => {
  const logger = recorder();
  const proc = new EventEmitter();
  let exited = null;
  installProcessHandlers({ proc, logger, exit: (code) => { exited = code; } });

  proc.emit("uncaughtException", new Error("kaboom"));

  assert.equal(logger.calls[0].msg, "process:uncaught-exception");
  assert.equal(logger.calls[0].level, "error");
  assert.equal(exited, 1);
});

test("a non-Error rejection reason is still logged", () => {
  const logger = recorder();
  const proc = new EventEmitter();
  installProcessHandlers({ proc, logger, exit: () => {} });

  proc.emit("unhandledRejection", "plain string reason");

  assert.equal(logger.calls[0].meta.error, "plain string reason");
});

function shutdownHarness({ flush, timeoutMs = 1000 } = {}) {
  const logger = recorder();
  const proc = new EventEmitter();
  const order = [];
  const server = { close: (cb) => { order.push("close"); cb?.(); } };
  const done = new Promise((resolve) => {
    installShutdownHandler({
      proc, server, logger, timeoutMs,
      flush: async () => { order.push("flush"); await flush?.(); },
      exit: (code) => { order.push(`exit:${code}`); resolve(); },
    });
  });
  return { proc, order, done, logger };
}

test("SIGTERM stops accepting connections, flushes telemetry, then exits cleanly", async () => {
  const { proc, order, done, logger } = shutdownHarness();
  proc.emit("SIGTERM");
  await done;
  assert.deepEqual(order, ["close", "flush", "exit:0"]);
  assert.equal(logger.calls.length, 0, "a clean shutdown is not an error");
});

test("SIGTERM still exits if the flush never finishes", async () => {
  const { proc, order, done, logger } = shutdownHarness({ flush: () => new Promise(() => {}), timeoutMs: 20 });
  proc.emit("SIGTERM");
  await done;
  assert.equal(order.at(-1), "exit:0");
  assert.equal(logger.calls[0].msg, "process:shutdown-flush-failed");
});

test("a second SIGTERM does not run the shutdown twice", async () => {
  const { proc, order, done } = shutdownHarness();
  proc.emit("SIGTERM");
  proc.emit("SIGTERM");
  await done;
  assert.equal(order.filter((step) => step === "flush").length, 1);
});
