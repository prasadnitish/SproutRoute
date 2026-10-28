/**
 * Weekly trend job. For each city with seeds (Instagram locations and hashtags) it
 *   1. fetches the last week of public posts,
 *   2. drops ads, giveaways and real estate, then groups posts by venue (the structured location first,
 *      captions only for posts that have none),
 *   3. asks Claude which venues a family could visit,
 *   4. resolves each new venue to a Google place and links it to an existing attraction by place id, or adds it
 *      as a 'trending' row,
 *   5. stores the posts (link, time, counts, hashed author, place; no captions or handles) and scores each venue,
 *   6. halves the score of venues with no new posts, one step per whole week since the score was set.
 *
 * Re-running with the same data changes nothing: posts are keyed by link, venues by place id, a venue that
 * already has a stored mapping is not looked up again, and decay is measured from when the score was last set.
 * Nothing is written unless `apply` is true.
 */
import { createHmac, randomUUID } from "node:crypto";
import { resolvePlace, statusForPlace, placeRowFields } from "../placesGrounding.js";
import { categoryFor } from "../placesFill.js";
import { postVelocity, scoreVenue, applyWeeklyDecay } from "./scoring.js";

const DAY = 86400000;
const WEEK = 7 * DAY;
const MAX_NEW_VENUES_PER_CITY = 20;
const MAX_CAPTIONS_TO_EXTRACT = 60;
const PROMO = /(giveaway|sweepstake|\bsponsored\b|\bpaid partnership\b|open house|just listed|for sale|promo code|discount code|(^|\s)#ad\b)/i;

const normalizeName = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const hashAuthor = (salt, handle) => (handle ? createHmac("sha256", salt).update(String(handle).toLowerCase()).digest("hex").slice(0, 32) : null);
const iso = (ms) => new Date(ms).toISOString();

function defaultResolveVenue({ name, city }) {
  return resolvePlace({ name, city: city.display_name || city.city_name, cityLat: city.lat, cityLon: city.lon });
}

export async function runTrendJob({
  admin, provider, classifier, resolveVenue = defaultResolveVenue,
  now = Date.now(), apply = false, cityId = null, sinceDays = 7, postLimit = 50,
  authorSalt = process.env.TREND_AUTHOR_SALT || "sproutroute-trend-v1", onProgress = () => {},
}) {
  const runId = randomUUID();
  const nowIso = iso(now);
  const summary = {
    runId, applied: apply, cities: 0, seeds: 0, fetched: 0, droppedPromo: 0, droppedNoVenue: 0, droppedNotFamily: 0,
    droppedNoPlace: 0, inserted: 0, linked: 0, scored: 0, decayed: 0, postsStored: 0, errors: 0,
  };

  let seedQuery = admin.from("city_seeds").select("id, city_id, kind, value, label").eq("active", true);
  if (cityId) seedQuery = seedQuery.eq("city_id", cityId);
  const { data: seeds, error: seedError } = await seedQuery;
  if (seedError) throw new Error(`seed lookup failed: ${seedError.message}`);
  const seedsByCity = new Map();
  for (const seed of seeds || []) seedsByCity.set(seed.city_id, [...(seedsByCity.get(seed.city_id) || []), seed]);
  if (!seedsByCity.size) return summary;

  const { data: cities, error: cityError } = await admin.from("cities").select("id, city_name, display_name, lat, lon").in("id", [...seedsByCity.keys()]);
  if (cityError) throw new Error(`city lookup failed: ${cityError.message}`);

  for (const city of cities || []) {
    summary.cities += 1;
    try {
      await runCity(city, seedsByCity.get(city.id));
    } catch (error) {
      summary.errors += 1;
      onProgress({ city: city.city_name, error: error.message });
    }
  }
  return summary;

  async function runCity(city, citySeeds) {
    summary.seeds += citySeeds.length;
    let allFetched = true;

    // 1. Fetch.
    const fetched = [];
    for (const seed of citySeeds) {
      try {
        const posts = seed.kind === "location"
          ? await provider.fetchLocationPosts({ locationId: seed.value, limit: postLimit, sinceDays })
          : await provider.fetchHashtagPosts(seed.value, { limit: postLimit, sinceDays });
        for (const post of posts) fetched.push({ post, seed });
      } catch (error) {
        allFetched = false;
        summary.errors += 1;
        onProgress({ city: city.city_name, seed: seed.value, error: error.message });
      }
    }
    summary.fetched += fetched.length;

    // 2. Drop promotional posts; assign each remaining post to a venue.
    const kept = fetched.filter(({ post }) => {
      const promo = post.caption && PROMO.test(post.caption);
      if (promo) summary.droppedPromo += 1;
      return !promo;
    });

    const unlocated = kept.filter(({ post, seed }) => !post.location_id && !(seed.kind === "location" && seed.label));
    const extracted = new Map();
    if (unlocated.length) {
      const captions = unlocated.filter(({ post }) => post.caption).slice(0, MAX_CAPTIONS_TO_EXTRACT).map(({ post }) => ({ id: post.url, text: post.caption }));
      for (const item of await classifier.extractVenues({ city: city.display_name || city.city_name, captions })) {
        if (item.venue) extracted.set(item.id, item.venue);
      }
    }

    const venues = new Map(); // key -> { key, name, posts: [{post, seed}], captions }
    for (const entry of kept) {
      const { post, seed } = entry;
      let key = null;
      let name = null;
      if (post.location_id) { key = `loc:${post.location_id}`; name = post.location_name || seed.label || ""; }
      else if (seed.kind === "location" && seed.label) { key = `loc:${seed.value}`; name = seed.label; }
      else if (extracted.has(post.url)) { name = extracted.get(post.url); key = `name:${normalizeName(name)}`; }
      if (!key || !name) { summary.droppedNoVenue += 1; continue; }
      const venue = venues.get(key) || { key, name, posts: [], captions: [] };
      venue.posts.push(entry);
      if (post.caption) venue.captions.push(post.caption);
      venues.set(key, venue);
    }

    // 3. Map venues to attractions: a stored mapping first, else classify and resolve.
    const { data: storedPosts } = await admin.from("trend_posts")
      .select("post_url, attraction_id, venue_key, posted_at, likes, comments, views, author_hash")
      .eq("city_id", city.id).gte("posted_at", iso(now - 2 * WEEK));
    const mapped = new Map();
    for (const stored of storedPosts || []) if (stored.attraction_id) mapped.set(stored.venue_key, stored.attraction_id);

    const { data: attractionRows } = await admin.from("city_attractions")
      .select("id, canonical_name, google_place_id, status, trend_score, trend_updated_at")
      .eq("city_id", city.id);
    const attractions = new Map((attractionRows || []).map((row) => [row.id, { ...row }]));
    const byPlaceId = new Map((attractionRows || []).filter((r) => r.google_place_id).map((r) => [r.google_place_id, r.id]));

    const venueAttraction = new Map(); // venue key -> attraction id
    for (const key of venues.keys()) if (mapped.has(key) && attractions.has(mapped.get(key))) venueAttraction.set(key, mapped.get(key));

    const unmapped = [...venues.values()].filter((v) => !venueAttraction.has(v.key))
      .sort((a, b) => b.posts.length - a.posts.length).slice(0, MAX_NEW_VENUES_PER_CITY);
    let verdicts = new Map();
    if (unmapped.length) {
      try {
        verdicts = await classifier.classifyVenues({ city: city.display_name || city.city_name, venues: unmapped.map((v) => ({ key: v.key, name: v.name, captions: v.captions })) });
      } catch (error) {
        allFetched = false;
        summary.errors += 1;
        onProgress({ city: city.city_name, error: `classifier: ${error.message}` });
        unmapped.length = 0;
      }
    }

    const newRows = [];
    for (const venue of unmapped) {
      const verdict = verdicts.get(venue.key);
      if (!verdict?.familyVisitable) { summary.droppedNotFamily += 1; continue; }
      const result = await resolveVenue({ name: verdict.name, city });
      if (result.status === "error") { summary.errors += 1; continue; }
      if (result.status === "unmatched" || statusForPlace(result) !== "active") { summary.droppedNoPlace += 1; continue; }
      const place = result.place;
      let attractionId = byPlaceId.get(place.placeId);
      if (attractionId) {
        summary.linked += 1;
      } else {
        summary.inserted += 1;
        attractionId = apply ? await insertTrendingRow(city, place) : `new:${place.placeId}`;
        if (!attractionId) continue;
        byPlaceId.set(place.placeId, attractionId);
        attractions.set(attractionId, { id: attractionId, canonical_name: place.name, google_place_id: place.placeId, status: "active", trend_score: 0, trend_updated_at: null });
        newRows.push({ attractionId, place });
      }
      venueAttraction.set(venue.key, attractionId);
    }
    for (const venue of venues.values()) if (venueAttraction.has(venue.key) && mapped.has(venue.key)) summary.linked += 1;

    // 4. Store posts.
    const postRows = [];
    const thisWeek = new Map(); // post url -> scoring record, merged with stored posts below
    for (const venue of venues.values()) {
      const attractionId = venueAttraction.get(venue.key);
      if (!attractionId) continue;
      for (const { post, seed } of venue.posts) {
        const author = hashAuthor(authorSalt, post.author);
        postRows.push({
          city_id: city.id,
          attraction_id: attractionId.startsWith("new:") ? null : attractionId,
          post_url: post.url, posted_at: post.timestamp, likes: post.likes ?? 0, comments: post.comments ?? 0, views: post.views ?? null,
          author_hash: author, venue_key: venue.key, venue_name: venue.name, seed_id: seed.id, fetched_at: nowIso,
        });
        thisWeek.set(post.url, { attractionId, timestamp: post.timestamp, likes: post.likes, comments: post.comments, views: post.views, author });
      }
    }
    summary.postsStored += postRows.length;
    if (apply && postRows.length) {
      const { error } = await admin.from("trend_posts").upsert(postRows, { onConflict: "post_url" });
      if (error) throw new Error(`storing posts failed: ${error.message}`);
    }

    // 5. Score. Stored posts that were not fetched again still count for their week.
    const records = new Map(thisWeek);
    for (const stored of storedPosts || []) {
      if (!stored.attraction_id || records.has(stored.post_url)) continue;
      records.set(stored.post_url, { attractionId: stored.attraction_id, timestamp: stored.posted_at, likes: stored.likes, comments: stored.comments, views: stored.views, author: stored.author_hash });
    }
    const touched = new Set([...thisWeek.values()].map((r) => r.attractionId));
    const logs = [];
    for (const attractionId of touched) {
      const all = [...records.values()].filter((r) => r.attractionId === attractionId);
      const current = all.filter((r) => Date.parse(r.timestamp) > now - WEEK);
      const previous = all.filter((r) => Date.parse(r.timestamp) <= now - WEEK && Date.parse(r.timestamp) > now - 2 * WEEK);
      const previousVelocity = previous.length ? previous.reduce((sum, r) => sum + postVelocity(r, now - WEEK), 0) : null;
      const { score, uniqueAuthors, posts } = scoreVenue(current, { now, previousWeekVelocity: previousVelocity });
      const row = attractions.get(attractionId);
      summary.scored += 1;
      if (apply && !attractionId.startsWith("new:")) {
        const { error } = await admin.from("city_attractions").update({ trend_score: score, trend_updated_at: nowIso }).eq("id", attractionId);
        if (error) throw new Error(`score update failed: ${error.message}`);
        if (Math.abs(Number(row.trend_score || 0) - score) > 1e-4) {
          logs.push({ run_id: runId, attraction_id: attractionId, change_type: "trend_scored", detail: { from: Number(row.trend_score || 0), to: score, posts, authors: uniqueAuthors } });
        }
      }
    }
    for (const { attractionId, place } of newRows) {
      if (apply) logs.push({ run_id: runId, attraction_id: attractionId, change_type: "trend_added", detail: { placeId: place.placeId } });
    }

    // 6. Decay venues that had no posts this run, but only when every fetch for the city succeeded.
    if (allFetched) {
      for (const [id, row] of attractions) {
        if (touched.has(id) || !(Number(row.trend_score) > 0) || !row.trend_updated_at) continue;
        const weeks = Math.floor((now - Date.parse(row.trend_updated_at)) / WEEK);
        if (weeks < 1) continue;
        const decayed = applyWeeklyDecay(Number(row.trend_score), weeks);
        const next = decayed < 1 ? 0 : decayed;
        summary.decayed += 1;
        if (apply) {
          const { error } = await admin.from("city_attractions").update({ trend_score: next, trend_updated_at: iso(Date.parse(row.trend_updated_at) + weeks * WEEK) }).eq("id", id);
          if (error) throw new Error(`decay update failed: ${error.message}`);
          logs.push({ run_id: runId, attraction_id: id, change_type: "trend_scored", detail: { from: Number(row.trend_score), to: next, decayWeeks: weeks } });
        }
      }
    }
    if (apply && logs.length) await admin.from("refresh_log").insert(logs);
  }

  async function insertTrendingRow(city, place) {
    const row = {
      city_id: city.id, canonical_name: place.name, category: categoryFor(place), source_type: "trending", confidence_score: 0.7,
      ...placeRowFields(place, { status: "active", nowIso }),
    };
    const { data, error } = await admin.from("city_attractions").insert(row).select("id");
    if (!error) return data?.[0]?.id || null;
    if (error.code !== "23505") throw new Error(`insert failed: ${error.message}`);
    // Another run added the same place first: use its row.
    const { data: existing } = await admin.from("city_attractions").select("id").eq("city_id", city.id).eq("google_place_id", place.placeId);
    return existing?.[0]?.id || null;
  }
}
