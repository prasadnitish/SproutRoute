import { tracing } from "../services/tracing.js";
import { randomBytes } from "node:crypto";
import { buildSharedTripSnapshot } from "../../shared/shareSnapshot.js";
import { isPlacesCandidate, parseDayHours } from "../services/groundedAttractions.js";
import { estimateCostUsd } from "../utils/aiCost.js";
import { normalize } from "../services/placesGrounding.js";

async function liveDetails(id) {
  if (!process.env.GOOGLE_PLACES_API_KEY) throw new Error("Place details are temporarily unavailable.");
  const response = await fetch("https://places.googleapis.com/v1/places/" + encodeURIComponent(id), {
    headers: { "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": "id,rating,regularOpeningHours,businessStatus,photos" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Place details are temporarily unavailable.");
  return normalize(await response.json());
}

function fitsSlot(details, day, stop) {
  if (details.businessStatus !== "OPERATIONAL") return false;
  const weekday = new Date(day.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const line = details.openingHours?.weekdayDescriptions?.find(line => line.startsWith(weekday + ":"));
  const time = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(stop.start_time);
  if (!line || !time) return false;
  const minutes = (+time[1] % 12 + (time[3] === "PM" ? 12 : 0)) * 60 + +time[2];
  return parseDayHours(line)?.some(([start, end]) => minutes >= start && minutes + stop.duration_minutes <= end);
}

function safePlace(row) {
  return { name: row.canonical_name, place_id: row.google_place_id, category: row.category || "general",
    rating: null, hours: null, business_status: null, photo_reference: null };
}

// Tokens grant access to short-lived, process-local jobs. The separate web token grants read-only access.
export function createPlanningJobs({ run, details = liveDetails, now = Date.now, ttlMs = 30 * 60_000,
  websiteOrigin = "https://sproutroute.app", maxModelUsd = 0.50, waitMs = 1200, timeoutMs = 90_000, maxActive = 3, maxJobs = 100 } = {}) {
  const jobs = new Map();
  let active = 0;
  const newToken = () => randomBytes(32).toString("base64url");
  const unavailable = () => new Error("This trip is unavailable or has expired.");

  function get(id) {
    const job = jobs.get(id);
    if (!job || job.expires <= now()) throw unavailable();
    return job;
  }

  async function start(input) {
    const days = (Date.parse(input.endDate) - Date.parse(input.startDate)) / 86400000 + 1;
    if (!Number.isInteger(days) || days < 1 || days > 7) throw new Error("Choose a trip between one and seven days.");
    for (const [id, job] of jobs) if (job.expires <= now()) jobs.delete(id);
    if (active >= maxActive || jobs.size >= maxJobs) throw new Error("Planning is busy. Please try again later.");
    const job_id = newToken();
    const job = { pets: input.pets, expires: now() + ttlMs, token: newToken(), pool: new Map(),
      plan: { schema_version: 1, status: "pending", job_id, destination: input.destination, days: [] } };
    jobs.set(job_id, job);
    setTimeout(() => jobs.delete(job_id), ttlMs).unref();
    let remainingUsd = maxModelUsd;
    // Reserve before each actual provider call, including retries and repair. UTF-8 bytes
    // upper-bound prompt token count, with padding for provider message framing.
    function reserveModelAttempt({ modelId, system, user, maxTokens }) {
      const inputTokens = Buffer.byteLength(system || "") + Buffer.byteLength(user || "") + 1024;
      const cost = estimateCostUsd(modelId, { inputTokens, outputTokens: maxTokens });
      if (cost == null || cost < 0 || !Number.isFinite(cost) || cost > remainingUsd) throw new Error("Trip model budget exhausted.");
      remainingUsd -= cost;
    }
    active++;
    const controller = new AbortController();
    const fail = () => { job.plan = { ...job.plan, status: "failed", message: "Could not complete a Places-verified itinerary. Try a shorter trip or another destination." }; };
    const deadline = setTimeout(() => { controller.abort(); fail(); }, timeoutMs);
    const generate = () => Promise.resolve().then(() => run(input, { signal: controller.signal, timeoutMs, requireVerifiedPool: true, reserveModelAttempt })).then(result => {
      if (controller.signal.aborted) return;
      for (const row of result.candidates || []) if (isPlacesCandidate(row)) job.pool.set(row.google_place_id, safePlace(row));
      const itinerary = (result.scheduledItinerary || []).map((day, index) => ({
        day: index + 1, date: day.date,
        stops: (day.scheduled || []).filter(stop => stop.status === "scheduled" && stop.grounded === true && job.pool.has(stop.placeId))
          .map(stop => ({ ...job.pool.get(stop.placeId), start_time: stop.scheduledStart, duration_minutes: stop.duration, locked: false })),
      }));
      if (itinerary.length !== days || itinerary.some(day => !day.stops.length)) { fail(); return; }
      job.plan = { ...job.plan, status: "ready", runId: result.runId, days: itinerary, packingList: result.packingList,
        safety: result.safety?.status === "unavailable" ? { status: "unavailable" } : result.safety, open_url: websiteOrigin + "/s#mcp=" + job.token };
    }).catch(fail).finally(() => { clearTimeout(deadline); active--; })
      .then(() => ({status: job.plan.status === "ready" ? 200 : 503}));
    const generation = process.env.TRACING_ENABLED === "false" ? generate() : tracing.run("mcp.plan_trip", {}, generate);
    let timer;
    try { await Promise.race([generation, new Promise(resolve => { timer = setTimeout(resolve, waitMs); })]); }
    finally { clearTimeout(timer); }
    return job.plan;
  }

  function placeFor(job, id) {
    const place = job.pool.get(id);
    if (job.plan.status !== "ready" || !place) throw new Error("Place is outside this trip’s verified pool.");
    return place;
  }

  async function lookup(id) {
    let live;
    try { live = await details(id); } catch { /* return a host-safe error below */ }
    if (live?.placeId !== id) throw new Error("Place details are temporarily unavailable.");
    return live;
  }

  function findStop(plan, dayNumber, placeId) {
    const day = plan.days.find(day => day.day === dayNumber);
    const stop = day?.stops.find(stop => stop.place_id === placeId);
    if (!stop) throw new Error("This stop is no longer in that slot.");
    return { day, stop };
  }

  function replaceStop(job, day, stop, replacement) {
    job.plan = { ...job.plan, days: job.plan.days.map(item => item === day
      ? { ...day, stops: day.stops.map(item => item === stop ? replacement : item) } : item) };
    return job.plan;
  }

  return {
    start, status: id => get(id).plan,
    async attraction(id, placeId) {
      const place = placeFor(get(id), placeId);
      const live = await lookup(placeId);
      return { ...place, rating: live.rating ?? null, hours: live.openingHours?.weekdayDescriptions ?? null,
        business_status: live.businessStatus ?? null, photo_reference: live.photoRef ?? null };
    },
    search(id, query) {
      const job = get(id);
      if (job.plan.status !== "ready") throw unavailable();
      const term = query.trim().toLowerCase();
      return [...job.pool.values()].filter(place => (place.name + " " + place.category).toLowerCase().includes(term)).slice(0, 10);
    },
    setLock(id, dayNumber, placeId, locked) {
      const job = get(id);
      const { day, stop } = findStop(job.plan, dayNumber, placeId);
      return stop.locked === locked ? job.plan : replaceStop(job, day, stop, { ...stop, locked });
    },
    async swap(id, dayNumber, placeId) {
      const job = get(id);
      const original = job.plan;
      const { day, stop } = findStop(original, dayNumber, placeId);
      if (stop.locked) throw new Error("This stop is locked. Unlock it before swapping.");
      const used = new Set(original.days.flatMap(day => day.stops.map(stop => stop.place_id)));
      const alternatives = [...job.pool.values()].filter(place => place.category === stop.category && !used.has(place.place_id));
      for (const place of alternatives.slice(0, 3)) {
        const live = await lookup(place.place_id);
        if (!fitsSlot(live, day, stop)) continue;
        if (get(id).plan !== original) throw new Error("The trip changed. Refresh before swapping.");
        return replaceStop(job, day, stop, { ...place, start_time: stop.start_time, duration_minutes: stop.duration_minutes, locked: false });
      }
      throw new Error("No verified alternative was available in this category and time slot.");
    },
    handoff(token) {
      const job = [...jobs.values()].find(job => job.token === token && job.expires > now() && job.plan.status === "ready");
      if (!job) throw unavailable();
      const { days, destination } = job.plan;
      const scheduledItinerary = days.map(({ day, date, stops }) => ({ day: "Day " + day, date,
        scheduled: stops.map(stop => ({ id: stop.place_id, name: stop.name, category: stop.category,
          scheduledStart: stop.start_time, duration: stop.duration_minutes, locked: stop.locked, status: "scheduled" })) }));
      const trip = { destination, startDate: days[0].date, endDate: days.at(-1).date, duration: days.length };
      return { snapshot: buildSharedTripSnapshot({ trip, pets: job.pets, packingList: job.plan.packingList, scheduledItinerary,
        tripPlan: { suggestedActivities: scheduledItinerary.flatMap(day => day.scheduled), dailyItinerary: scheduledItinerary.map(day => ({day: day.day, date: day.date, activities: day.scheduled})) } }),
        expiresAt: new Date(job.expires).toISOString() };
    },
  };
}
