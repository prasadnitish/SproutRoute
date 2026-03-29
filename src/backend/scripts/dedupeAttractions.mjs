import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import { areNamesNearDuplicate } from "../services/attractionMemory.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function getAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchAllCities(admin) {
  const { data, error } = await admin
    .from("cities")
    .select("id, city_name")
    .limit(500);

  if (error) throw error;
  return data || [];
}

async function fetchAttractionsForCity(admin, cityId) {
  const { data, error } = await admin
    .from("city_attractions")
    .select("id, canonical_name, google_place_id, times_seen, confidence_score, verification_status")
    .eq("city_id", cityId)
    .limit(200);

  if (error) throw error;
  return data || [];
}

async function deleteAttraction(admin, id) {
  // Delete verification cache entries first (FK constraint)
  await admin
    .from("attraction_verification_cache")
    .delete()
    .eq("attraction_id", id);

  const { error } = await admin
    .from("city_attractions")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

async function bumpTimesSeen(admin, id, newCount) {
  const { error } = await admin
    .from("city_attractions")
    .update({ times_seen: newCount, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

function groupByPlaceId(attractions) {
  const groups = new Map();
  for (const attraction of attractions) {
    const placeId = attraction.google_place_id;
    if (!placeId) continue;
    if (!groups.has(placeId)) groups.set(placeId, []);
    groups.get(placeId).push(attraction);
  }
  return groups;
}

function findNearDuplicatePairs(attractions) {
  const withoutPlaceId = attractions.filter((a) => !a.google_place_id);
  const pairs = [];

  for (let i = 0; i < withoutPlaceId.length; i++) {
    for (let j = i + 1; j < withoutPlaceId.length; j++) {
      if (areNamesNearDuplicate(withoutPlaceId[i].canonical_name, withoutPlaceId[j].canonical_name)) {
        pairs.push([withoutPlaceId[i], withoutPlaceId[j]]);
      }
    }
  }
  return pairs;
}

function pickWinner(rows) {
  return rows.reduce((best, current) => {
    const bestScore = Number(best.times_seen || 0);
    const currentScore = Number(current.times_seen || 0);
    if (currentScore > bestScore) return current;
    if (currentScore === bestScore) {
      const bestConf = Number(best.confidence_score || 0);
      const currentConf = Number(current.confidence_score || 0);
      if (currentConf > bestConf) return current;
    }
    return best;
  });
}

async function main() {
  const admin = getAdmin();
  const cities = await fetchAllCities(admin);
  console.log(`Found ${cities.length} cities to scan.`);

  let totalMerged = 0;
  let totalDeleted = 0;

  for (const city of cities) {
    const attractions = await fetchAttractionsForCity(admin, city.id);
    if (attractions.length < 2) continue;

    // Phase 1: Merge by google_place_id
    const placeIdGroups = groupByPlaceId(attractions);
    const deletedIds = new Set();

    for (const [placeId, group] of placeIdGroups) {
      if (group.length < 2) continue;

      const winner = pickWinner(group);
      const losers = group.filter((a) => a.id !== winner.id);
      const mergedTimesSeen = group.reduce((sum, a) => sum + Number(a.times_seen || 0), 0);

      console.log(`[${city.city_name}] place_id merge: keeping "${winner.canonical_name}" (id=${winner.id}), removing ${losers.length} dupes for place_id=${placeId}`);

      await bumpTimesSeen(admin, winner.id, mergedTimesSeen);

      for (const loser of losers) {
        await deleteAttraction(admin, loser.id);
        deletedIds.add(loser.id);
        totalDeleted += 1;
      }
      totalMerged += 1;
    }

    // Phase 2: Merge near-duplicate names (no place ID)
    const remaining = attractions.filter((a) => !deletedIds.has(a.id));
    const nearDupePairs = findNearDuplicatePairs(remaining);

    for (const [a, b] of nearDupePairs) {
      if (deletedIds.has(a.id) || deletedIds.has(b.id)) continue;

      const confA = Number(a.confidence_score || 0);
      const confB = Number(b.confidence_score || 0);
      const [winner, loser] = confA >= confB ? [a, b] : [b, a];

      const mergedTimesSeen = Number(winner.times_seen || 0) + Number(loser.times_seen || 0);

      console.log(`[${city.city_name}] name merge: keeping "${winner.canonical_name}" (id=${winner.id}), removing "${loser.canonical_name}" (id=${loser.id})`);

      await bumpTimesSeen(admin, winner.id, mergedTimesSeen);
      await deleteAttraction(admin, loser.id);
      deletedIds.add(loser.id);
      totalDeleted += 1;
      totalMerged += 1;
    }
  }

  console.log(`\nDone. Merged ${totalMerged} groups, deleted ${totalDeleted} duplicate rows.`);
}

main().catch((error) => {
  console.error("Dedupe failed:", error.message);
  process.exitCode = 1;
});
