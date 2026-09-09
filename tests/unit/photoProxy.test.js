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

test('photo resolution follows only an approved Google image URL without forwarding the key',async()=>{
 const {fetchPlacePhoto}=await import('../../src/backend/services/photoProxy.js');
 assert.equal(typeof fetchPlacePhoto,'function');
 const calls=[];
 await fetchPlacePhoto('places/test/photos/test','secret',async(url,options)=>{calls.push({url,options});return calls.length===1?new Response(JSON.stringify({photoUri:'https://lh3.googleusercontent.com/example'})):new Response('image',{headers:{'content-type':'image/jpeg'}})});
 assert.match(calls[0].url,/skipHttpRedirect=true/);
 assert.equal(calls[0].options.headers['X-Goog-Api-Key'],'secret');
 assert.equal(calls[1].options.headers,undefined);
 assert.equal(calls[1].options.redirect,'error');
 await assert.rejects(fetchPlacePhoto('places/test/photos/test','secret',async()=>new Response(JSON.stringify({photoUri:'http://127.0.0.1/'}))),/Untrusted/);
});
