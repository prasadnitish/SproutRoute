import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTraceArchive } from "../../src/backend/services/traceArchive.js";
test("archive survives recorder restart and bounds storage by rotating", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sprout-traces-"));
  try {
    const path = join(dir, "traces.jsonl");
    const t = { meta: { schema_version: 1, run_id: "one" }, spans: [] };
    const size = Buffer.byteLength(JSON.stringify(t) + "\n");
    const a = createTraceArchive(path, { maxBytes: size + 5 });
    a.append(t);
    await a.flush();
    a.append({ ...t, meta: { ...t.meta, run_id: "two" } });
    await a.flush();
    assert.equal(createTraceArchive(path).load()[0].meta.run_id, "two");
    assert.ok((await readFile(path + ".previous", "utf8")).includes("one"));
    assert.equal(a.health().persisted, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("archive failure reports dropped evidence and does not reject flush", async () => {
  const a = createTraceArchive("/dev/null/cannot-write");
  a.append({ meta: {}, spans: [] });
  await a.flush();
  assert.equal(a.health().error, "ARCHIVE_WRITE_FAILED");
  assert.equal(a.health().dropped, 1);
});
