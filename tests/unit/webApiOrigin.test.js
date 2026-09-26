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
      const code = source.replaceAll("'./journeyTrace.js'", JSON.stringify(new URL("../../src/frontend/src/services/journeyTrace.js", import.meta.url).href)).replaceAll("import.meta.env", JSON.stringify({ PROD: true, VITE_API_URL: configured }));
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
    const code = source.replaceAll("'./journeyTrace.js'", JSON.stringify(new URL("../../src/frontend/src/services/journeyTrace.js", import.meta.url).href)).replaceAll("import.meta.env", JSON.stringify({ PROD: false, VITE_API_URL: "http://localhost:4000/" }));
    const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    await api.checkHealth();
    assert.equal(requestedUrl, "http://localhost:4000/api/health");
  } finally {
    global.fetch = originalFetch;
  }
});

test('city chunks that complete out of order remain in route-day order',async()=>{
 const original=global.fetch;
 const chunk=(id,day)=>`event: stop-itinerary\ndata: ${JSON.stringify({stop:{id},tripPlan:{suggestedActivities:[{id:`${id}:a`,name:id}],dailyItinerary:[{routeDay:day,activities:[`${id}:a`]}]},scheduledItinerary:[{routeDay:day,scheduled:[]}]})}\n\n`;
 global.fetch=async()=>new Response(chunk('Kyoto',4)+chunk('Tokyo',1)+'event: done\ndata: {}\n\n',{headers:{'content-type':'text/event-stream'}});
 try{
 const code=source.replaceAll("'./journeyTrace.js'", JSON.stringify(new URL('../../src/frontend/src/services/journeyTrace.js',import.meta.url).href)).replaceAll('import.meta.env',JSON.stringify({PROD:true}));const api=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
 const result=await api.streamTripPlan({destination:'Japan'},()=>{});
 assert.deepEqual(result.tripPlan.dailyItinerary.map(d=>d.routeDay),[1,4]);
 assert.deepEqual(result.scheduledItinerary.map(d=>d.routeDay),[1,4]);
 }finally{global.fetch=original;}
});
test('an explicit generation error does not silently repeat an expensive bundle request',async()=>{
 const original=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return new Response('event: error\ndata: {"message":"Stop location not found"}\n\n',{headers:{'content-type':'text/event-stream'}})};
 try{const code=source.replaceAll("'./journeyTrace.js'", JSON.stringify(new URL('../../src/frontend/src/services/journeyTrace.js',import.meta.url).href)).replaceAll('import.meta.env',JSON.stringify({PROD:true}));const api=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);await assert.rejects(api.streamTripPlan({destination:'Japan'},()=>{}),/Stop location not found/);assert.equal(calls,1);}finally{global.fetch=original;}
});

test("a rate-limited parse request is shown without retrying", async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ error: "Too many AI requests. Please try again in 1 hour." }), {
      status: 429,
      headers: { "content-type": "application/json", "RateLimit-Reset": "3600" },
    });
  };

  try {
    const code = source.replaceAll("'./journeyTrace.js'", JSON.stringify(new URL("../../src/frontend/src/services/journeyTrace.js", import.meta.url).href)).replaceAll("import.meta.env", JSON.stringify({ PROD: true }));
    const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    await assert.rejects(api.parseInput({ text: "Seattle weekend" }), /Too many AI requests/);
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("a rate-limited stream does not start a bundle request", async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ error: "Too many AI requests. Please try again in 1 hour." }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const code = source.replaceAll("'./journeyTrace.js'", JSON.stringify(new URL("../../src/frontend/src/services/journeyTrace.js", import.meta.url).href)).replaceAll("import.meta.env", JSON.stringify({ PROD: true }));
    const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    await assert.rejects(api.streamTripPlan({ destination: "Seattle" }, () => {}), /Too many AI requests/);
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
