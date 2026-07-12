import assert from "node:assert/strict";
import test from "node:test";

import { readBoundedResponseBody } from "../../src/backend/services/photoProxy.js";

function responseWithChunks(chunks, contentLength = null) {
  return {
    headers: new Headers(contentLength === null ? {} : { "content-length": String(contentLength) }),
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(Buffer.from(chunk));
        controller.close();
      },
    }),
  };
}

test("bounded photo reader accepts a body below the cap", async () => {
  const body = await readBoundedResponseBody(responseWithChunks(["abc", "def"], 6), 6);
  assert.equal(body.toString(), "abcdef");
});

test("bounded photo reader rejects an oversized declared body before reading", async () => {
  await assert.rejects(
    () => readBoundedResponseBody(responseWithChunks(["ignored"], 99), 6),
    /too large/i,
  );
});

test("bounded photo reader rejects a streamed body that crosses the cap", async () => {
  await assert.rejects(
    () => readBoundedResponseBody(responseWithChunks(["abc", "defg"]), 6),
    /too large/i,
  );
});
