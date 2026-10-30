import { log, errorFields } from "./logger.js";

// Without these, a stray rejection or throw ends the process with an unstructured stderr trace.
// Rejections are logged and the process keeps serving; an uncaught exception leaves unknown state,
// so it is logged and the process exits for Railway to restart.
export function installProcessHandlers({ proc = process, logger = log, exit = (code) => process.exit(code) } = {}) {
  proc.on("unhandledRejection", (reason) => logger.error("process:unhandled-rejection", errorFields(reason)));
  proc.on("uncaughtException", (err) => {
    logger.error("process:uncaught-exception", errorFields(err));
    exit(1);
  });
}

// Railway sends SIGTERM on every redeploy. Stop taking new connections, give telemetry a bounded chance to
// flush, then exit. Open streams are not awaited: they would hold the exit past Railway's kill timer.
export function installShutdownHandler({ proc = process, server, flush, logger = log, exit = (code) => process.exit(code), timeoutMs = 8000 }) {
  let started = false;
  proc.on("SIGTERM", async () => {
    if (started) return;
    started = true;
    let timer;
    try {
      server.close();
      await Promise.race([
        flush(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`telemetry flush exceeded ${timeoutMs}ms`)), timeoutMs); }),
      ]);
    } catch (err) {
      logger.error("process:shutdown-flush-failed", errorFields(err));
    } finally {
      clearTimeout(timer);
      exit(0);
    }
  });
}
