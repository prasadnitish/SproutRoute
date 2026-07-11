import { generatePackingList as generatePackingListDeterministic } from "../services/deterministicPacking.js";

// Wraps deterministicPacking.js — the function actually wired into production
// (server.js imports this one, not packingListAI.js's AI-based version, which
// is currently dead code as far as the live app is concerned).
export async function runPackingAgent(input, retrieval, deps = {}) {
  const { generatePackingListFn = generatePackingListDeterministic } = deps;
  const { startDate, endDate, activities, children, pets } = input;

  const tripData = {
    startDate,
    endDate,
    activities: activities?.length ? activities : ["family-friendly", "parks", "city"],
    children: children || [],
    pets: pets || [],
  };

  const packingList = await generatePackingListFn(tripData, retrieval.weather);
  return { packingList };
}
