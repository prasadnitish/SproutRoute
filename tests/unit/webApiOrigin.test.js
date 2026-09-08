import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../src/frontend/src/services/api.js", import.meta.url), "utf8");

test("production API calls stay on the page origin despite a stale build hostname", async () => {
  const originalFetch = global.fetch;
  const urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    if (url.endsWith("/stream")) {
      return new Response('event: done\ndata: {}\n\n', {
        headers: { "content-type": "text/event-stream" },
      });
    }
    return new Response(JSON.stringify({ destination: "Japan" }), {
      headers: { "content-type": "application/json" },
    });
  };
  try {
    for (const configured of ["https://www.sproutroute.app", ""]) {
      const code = source.replaceAll("import.meta.env", JSON.stringify({ PROD: true, VITE_API_URL: configured }));
      const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
      await api.parseInput({ text: "japan trip for 2 in winter" });
      await api.streamTripPlan({ destination: "Japan" }, () => {});
    }
    assert.deepEqual(urls, [
      "/api/v1/trip/parse-input", "/api/v1/trip/stream",
      "/api/v1/trip/parse-input", "/api/v1/trip/stream",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("development API calls retain the configured backend URL", async () => {
  const originalFetch = global.fetch;
  let requestedUrl;
  global.fetch = async (url) => {
    requestedUrl = url;
    return new Response('{"status":"ok"}');
  };
  try {
    const code = source.replaceAll("import.meta.env", JSON.stringify({ PROD: false, VITE_API_URL: "http://localhost:4000/" }));
    const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    await api.checkHealth();
    assert.equal(requestedUrl, "http://localhost:4000/api/health");
  } finally {
    global.fetch = originalFetch;
  }
});
