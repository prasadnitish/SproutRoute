import "dotenv/config";

import { createAttractionMemoryService } from "../services/attractionMemory.js";

function getArg(flag, fallback = "") {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function printUsage() {
  console.log("Usage: node src/backend/scripts/backfillAttractionIdentity.mjs --city \"Santa Barbara, CA\" [--country US] [--limit 25]");
}

async function main() {
  const destination = getArg("--city");
  const countryCode = getArg("--country", "US");
  const limit = Number(getArg("--limit", "25")) || 25;

  if (!destination) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const service = createAttractionMemoryService();
  const result = await service.backfillCityAttractions({
    destination,
    coords: {
      displayName: destination,
      countryCode,
    },
    countryCode,
    limit,
  });

  console.log(JSON.stringify({
    destination,
    countryCode,
    limit,
    ...result,
  }, null, 2));
}

main().catch((error) => {
  console.error("Backfill failed:", error.message);
  process.exitCode = 1;
});
