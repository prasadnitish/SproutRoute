import { appendFile, mkdir, stat, rename } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";

/** Optional bounded archive. Put the path on a durable volume in production. */
export function createTraceArchive(
  path,
  { maxBytes = 10_000_000, maxQueued = 100 } = {},
) {
  const health = {
    enabled: Boolean(path),
    persisted: 0,
    dropped: 0,
    error: null,
  };
  let queue = Promise.resolve(),
    pending = 0;
  function load() {
    if (!path) return [];
    try {
      if (statSync(path).size > maxBytes) return [];
      return readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .flatMap((line) => {
          try {
            const t = JSON.parse(line);
            return t?.meta?.schema_version === 1 && Array.isArray(t.spans)
              ? [t]
              : [];
          } catch {
            return [];
          }
        })
        .slice(-100);
    } catch (e) {
      if (e.code !== "ENOENT") health.error = "ARCHIVE_READ_FAILED";
      return [];
    }
  }
  function append(trace) {
    if (!path) return;
    if (pending >= maxQueued) {
      health.dropped++;
      return;
    }
    const line = JSON.stringify(trace) + "\n";
    if (Buffer.byteLength(line) > maxBytes) {
      health.dropped++;
      return;
    }
    pending++;
    queue = queue
      .then(async () => {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        let size = 0;
        try {
          size = (await stat(path)).size;
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        // Two segments, each <= maxBytes. Rotation replaces only the archive's own previous segment.
        if (size + Buffer.byteLength(line) > maxBytes)
          await rename(path, path + ".previous");
        await appendFile(path, line, { encoding: "utf8", mode: 0o600 });
        health.persisted++;
        health.error = null;
      })
      .catch(() => {
        health.dropped++;
        health.error = "ARCHIVE_WRITE_FAILED";
      })
      .finally(() => {
        pending--;
      });
  }
  return {
    append,
    load,
    flush: () => queue,
    health: () => ({
      ...health,
      pending,
      max_bytes_per_segment: maxBytes,
      segments: 2,
    }),
  };
}
