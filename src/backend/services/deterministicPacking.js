import { detectClimateZone, getPackingBaseTemplate } from "./ragTemplates.js";
import { inclusiveDayCount } from "../utils/dateCalc.js";

const CATEGORY_ORDER = [
  "Clothing",
  "Toiletries",
  "Gear",
  "Documents",
  "Medications",
  "Entertainment",
  "Snacks",
  "Baby/Toddler Items",
  "Pet Supplies",
];

function tripDays(startDate, endDate) {
  return inclusiveDayCount(startDate, endDate);
}

function inferTripType(activities = [], explicitTripType = null) {
  if (explicitTripType) return explicitTripType;
  const joined = (activities || []).join(" ").toLowerCase();
  if (/(beach|swim|snorkel|ocean|pool|water)/.test(joined)) return "beach";
  if (/(hike|trail|camp|adventure|national park)/.test(joined)) return "adventure";
  if (/(city|museum|shopping|dining|restaurant)/.test(joined)) return "city";
  if (/cruise/.test(joined)) return "cruise";
  if (/international/.test(joined)) return "international";
  return "general";
}

function quantityForDailyItem(days, { min = 2, max = 7, every = 1 } = {}) {
  const qty = Math.max(min, Math.min(max, Math.ceil(days / every)));
  return `${qty}`;
}

function makeSearchQuery(name, qualifiers = []) {
  return [name, ...qualifiers]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeCategoryStore() {
  return new Map(CATEGORY_ORDER.map((name) => [name, []]));
}

function addItem(store, categoryName, item) {
  const items = store.get(categoryName) || [];
  const key = item.name.trim().toLowerCase();
  if (items.some((existing) => existing.name.trim().toLowerCase() === key)) {
    return;
  }
  items.push({
    name: item.name,
    quantity: item.quantity || "1",
    reason: item.reason || "",
    searchQuery: item.searchQuery || makeSearchQuery(item.name),
  });
  store.set(categoryName, items);
}

function addTemplateExtras(store, climateZone, tripType, { hasToddler, isRainy }) {
  const template = getPackingBaseTemplate(climateZone, tripType);
  const extras = template
    .split("\n")
    .map((line) => line.replace(/^-+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6);

  extras.forEach((name) => {
    const lower = name.toLowerCase();
    if (lower.includes("sunscreen")) {
      addItem(store, "Toiletries", {
        name: "Sunscreen",
        quantity: "1-2",
        reason: "Protect against strong sun exposure during outdoor time",
        searchQuery: makeSearchQuery("travel sunscreen", ["family"]),
      });
    } else if (lower.includes("rain") || lower.includes("umbrella")) {
      addItem(store, "Gear", {
        name: isRainy ? "Compact umbrella" : "Packable rain layer",
        quantity: "1",
        reason: "Useful if the forecast shifts wetter than expected",
        searchQuery: makeSearchQuery(isRainy ? "compact umbrella" : "packable rain jacket"),
      });
    } else if (lower.includes("hat")) {
      addItem(store, "Clothing", {
        name: hasToddler ? "Sun hat" : "Weather-ready hat",
        quantity: "1",
        reason: "Easy sun and wind protection for long outdoor stretches",
        searchQuery: makeSearchQuery(hasToddler ? "kids sun hat" : "travel hat"),
      });
    } else if (lower.includes("water bottle")) {
      addItem(store, "Gear", {
        name: "Reusable water bottle",
        quantity: "2",
        reason: "Keeps everyone hydrated while moving between stops",
        searchQuery: makeSearchQuery("travel water bottle", ["family"]),
      });
    }
  });
}

function finalizeCategories(store) {
  return CATEGORY_ORDER
    .map((name) => ({
      name,
      items: (store.get(name) || []).slice(0, 6),
    }))
    .filter((category) => category.items.length > 0);
}

export async function generatePackingList(tripData, weatherForecast) {
  const {
    startDate,
    endDate,
    activities = [],
    children = [],
    pets = [],
    tripType = null,
    foodPreferences = null,
  } = tripData;

  const days = tripDays(startDate, endDate);
  const climateZone = detectClimateZone(weatherForecast?.forecast || []);
  const inferredTripType = inferTripType(activities, tripType);
  const activityText = (activities || []).join(" ").toLowerCase();
  const hasWaterPlans = /(beach|pool|swim|snorkel|water)/.test(activityText);
  const hasAdventurePlans = /(hike|trail|adventure|park|camp)/.test(activityText);
  const hasToddler = children.some((child) => child.age < 4);
  const hasYoungKids = children.some((child) => child.age < 7);
  const isRainy = (weatherForecast?.forecast || []).some((day) => (day.precipitation || 0) >= 45);
  const dietaryQualifier = foodPreferences?.dietary?.[0] ? [foodPreferences.dietary[0]] : [];

  const store = makeCategoryStore();

  addItem(store, "Clothing", {
    name: "Day outfits",
    quantity: quantityForDailyItem(days, { min: 3, max: 7 }),
    reason: "Enough comfortable outfits for active sightseeing days",
    searchQuery: makeSearchQuery(hasToddler ? "toddler travel outfits" : "travel outfits", ["family"]),
  });
  addItem(store, "Clothing", {
    name: "Sleepwear",
    quantity: quantityForDailyItem(days, { min: 2, max: 4, every: 2 }),
    reason: "Keeps bedtime simple without overpacking",
    searchQuery: makeSearchQuery(hasToddler ? "toddler pajamas" : "travel pajamas"),
  });
  addItem(store, "Clothing", {
    name: "Socks and underwear",
    quantity: quantityForDailyItem(days + 1, { min: 4, max: 8 }),
    reason: "Pack one extra set in case of spills or weather changes",
    searchQuery: makeSearchQuery("travel underwear socks", ["family"]),
  });
  addItem(store, "Clothing", {
    name: climateZone === "cold" ? "Warm outer layer" : "Light layer for evenings",
    quantity: "1",
    reason: "Even warm-weather trips usually need one flexible extra layer",
    searchQuery: makeSearchQuery(climateZone === "cold" ? "packable fleece jacket" : "light cardigan travel"),
  });
  if (hasWaterPlans || climateZone === "tropical") {
    addItem(store, "Clothing", {
      name: "Swimwear",
      quantity: hasToddler ? "2-3" : "2",
      reason: "Useful for beach, splash pad, or hotel pool time",
      searchQuery: makeSearchQuery(hasToddler ? "toddler swimwear" : "travel swimwear"),
    });
  }
  if (isRainy) {
    addItem(store, "Gear", {
      name: "Rain jacket",
      quantity: "1 per traveler",
      reason: "Keeps the trip moving even if afternoon showers roll in",
      searchQuery: makeSearchQuery("packable rain jacket", ["family"]),
    });
    addItem(store, "Gear", {
      name: "Compact umbrella",
      quantity: "1-2",
      reason: "Helpful for stroller walks or city days with light rain",
      searchQuery: makeSearchQuery("compact umbrella", ["travel"]),
    });
  }

  addItem(store, "Toiletries", {
    name: "Sunscreen",
    quantity: days >= 5 ? "2" : "1",
    reason: "Daily outdoor time adds up quickly, even on mild-weather trips",
    searchQuery: makeSearchQuery("travel sunscreen", ["family"]),
  });
  addItem(store, "Toiletries", {
    name: "Toothbrush and toothpaste",
    quantity: "1 set per traveler",
    reason: "Easy basics to keep together in one toiletry pouch",
    searchQuery: makeSearchQuery("travel toothbrush set", ["family"]),
  });
  addItem(store, "Toiletries", {
    name: "Wipes",
    quantity: hasToddler ? "2 packs" : "1 pack",
    reason: "Useful for quick cleanups, snacks, and playground stops",
    searchQuery: makeSearchQuery("travel wipes", hasToddler ? ["kids"] : []),
  });
  addItem(store, "Toiletries", {
    name: "Hand sanitizer",
    quantity: "1-2",
    reason: "Good for meals and transit between activities",
    searchQuery: makeSearchQuery("travel hand sanitizer"),
  });

  addItem(store, "Gear", {
    name: "Reusable water bottle",
    quantity: hasYoungKids ? "2-3" : "2",
    reason: "Keeps drinks handy during long activity windows",
    searchQuery: makeSearchQuery("reusable water bottle", ["travel"]),
  });
  addItem(store, "Gear", {
    name: "Day bag",
    quantity: "1",
    reason: "Holds snacks, layers, and quick-grab essentials for the day",
    searchQuery: makeSearchQuery("family day bag", ["travel"]),
  });
  addItem(store, "Gear", {
    name: "Phone charger and battery pack",
    quantity: "1 set",
    reason: "Maps, photos, and booking details drain batteries fast on travel days",
    searchQuery: makeSearchQuery("portable charger", ["travel"]),
  });
  if (hasToddler) {
    addItem(store, "Gear", {
      name: "Stroller",
      quantity: "1",
      reason: "Makes slow days easier and gives your toddler a rest option",
      searchQuery: makeSearchQuery("travel stroller"),
    });
  }
  if (hasWaterPlans) {
    addItem(store, "Gear", {
      name: "Beach towel",
      quantity: "1 per traveler",
      reason: "Useful for beach stops, splash zones, or hotel pool time",
      searchQuery: makeSearchQuery("quick dry beach towel", ["travel"]),
    });
  }
  if (hasAdventurePlans) {
    addItem(store, "Gear", {
      name: "Comfortable walking shoes",
      quantity: "1 pair per traveler",
      reason: "Supports longer days on trails, parks, and sidewalks",
      searchQuery: makeSearchQuery("comfortable walking shoes", ["travel"]),
    });
  }

  addItem(store, "Documents", {
    name: "IDs and passports",
    quantity: "1 set",
    reason: "Keep all core travel documents together before leaving home",
    searchQuery: makeSearchQuery("travel document organizer"),
  });
  addItem(store, "Documents", {
    name: "Booking confirmations",
    quantity: "digital + backup copy",
    reason: "Useful if cell service is spotty at check-in or entry gates",
    searchQuery: makeSearchQuery("travel folder organizer"),
  });
  addItem(store, "Documents", {
    name: "Insurance cards",
    quantity: "1 set",
    reason: "Good to have on hand for urgent care or pharmacy stops",
    searchQuery: makeSearchQuery("card organizer travel"),
  });
  addItem(store, "Documents", {
    name: "Emergency contact sheet",
    quantity: "1",
    reason: "Helpful backup if a phone dies or a caregiver needs details quickly",
    searchQuery: makeSearchQuery("emergency contact card"),
  });

  addItem(store, "Medications", {
    name: "Daily medications",
    quantity: `${days + 2} days`,
    reason: "Pack two extra days so schedule changes do not become a problem",
    searchQuery: makeSearchQuery("travel pill organizer"),
  });
  addItem(store, "Medications", {
    name: hasYoungKids ? "Kids pain reliever" : "Pain reliever",
    quantity: "1",
    reason: "Useful for headaches, fevers, or long active days",
    searchQuery: makeSearchQuery(hasYoungKids ? "kids pain reliever travel" : "pain reliever travel"),
  });
  addItem(store, "Medications", {
    name: "Bandages and antiseptic wipes",
    quantity: "1 kit",
    reason: "Small scrapes and blisters are common on family trips",
    searchQuery: makeSearchQuery("travel first aid kit"),
  });
  addItem(store, "Medications", {
    name: "Thermometer",
    quantity: "1",
    reason: "Helpful if a child seems run-down mid-trip",
    searchQuery: makeSearchQuery("travel thermometer"),
  });

  addItem(store, "Entertainment", {
    name: "Books and coloring kit",
    quantity: "1 set",
    reason: "Good for flights, restaurants, and quiet hotel time",
    searchQuery: makeSearchQuery("travel coloring kit", hasYoungKids ? ["kids"] : []),
  });
  addItem(store, "Entertainment", {
    name: "Favorite small toy",
    quantity: "1-2",
    reason: "Familiar items make transitions and downtime easier",
    searchQuery: makeSearchQuery("travel toy", hasYoungKids ? ["kids"] : []),
  });
  addItem(store, "Entertainment", {
    name: "Headphones or tablet entertainment",
    quantity: "1 set",
    reason: "Useful for long meals, transit, or rainy-hour breaks",
    searchQuery: makeSearchQuery("kids travel headphones"),
  });

  addItem(store, "Snacks", {
    name: "Snacks",
    quantity: days >= 5 ? "1 week supply" : "3-4 portions",
    reason: "Prevents hunger crashes between meals and gives flexibility on the go",
    searchQuery: makeSearchQuery("travel snacks", dietaryQualifier),
  });
  addItem(store, "Snacks", {
    name: "Fruit pouches or easy fruit option",
    quantity: hasYoungKids ? "4-6" : "2-3",
    reason: "Simple grab-and-go snack for stroller or car breaks",
    searchQuery: makeSearchQuery("fruit pouch", hasYoungKids ? ["kids"] : dietaryQualifier),
  });
  addItem(store, "Snacks", {
    name: "Refillable snack container",
    quantity: "1-2",
    reason: "Keeps snack portions easy to reach during long days out",
    searchQuery: makeSearchQuery("snack container", ["travel"]),
  });
  if (hasToddler) {
    addItem(store, "Snacks", {
      name: "Spill-proof water cup",
      quantity: "1",
      reason: "Helps avoid messes during long stroller or restaurant stretches",
      searchQuery: makeSearchQuery("spill proof water cup", ["toddler"]),
    });
  }

  if (hasToddler) {
    addItem(store, "Baby/Toddler Items", {
      name: "Extra toddler outfit",
      quantity: "2-3",
      reason: "A full backup outfit helps with spills, sand, and naps on the move",
      searchQuery: makeSearchQuery("toddler extra outfit", ["travel"]),
    });
    if (children.some((child) => child.age < 3)) {
      addItem(store, "Baby/Toddler Items", {
        name: "Diapers or pull-ups",
        quantity: `${days * 4}+`,
        reason: "Pack a full trip supply plus a cushion for delays",
        searchQuery: makeSearchQuery("travel diapers", ["toddler"]),
      });
    }
    addItem(store, "Baby/Toddler Items", {
      name: "Wipes refill",
      quantity: "1 refill pack",
      reason: "Good backup once the day bag pack starts running low",
      searchQuery: makeSearchQuery("travel wipes refill"),
    });
    addItem(store, "Baby/Toddler Items", {
      name: "Comfort item for sleep",
      quantity: "1",
      reason: "Helps preserve bedtime routine in a new space",
      searchQuery: makeSearchQuery("toddler comfort blanket", ["travel"]),
    });
  }

  if (pets.length > 0) {
    addItem(store, "Pet Supplies", {
      name: "Leash and ID tag",
      quantity: "1 set per pet",
      reason: "Essential for unfamiliar places and quick outdoor breaks",
      searchQuery: makeSearchQuery("pet leash id tag", ["travel"]),
    });
    addItem(store, "Pet Supplies", {
      name: "Pet food and treats",
      quantity: `${days + 2} days`,
      reason: "Keep pets on their normal routine and pack extra for delays",
      searchQuery: makeSearchQuery("pet food travel container"),
    });
    addItem(store, "Pet Supplies", {
      name: "Waste bags",
      quantity: "1 roll",
      reason: "Easy to forget, but needed on every walk stop",
      searchQuery: makeSearchQuery("pet waste bags"),
    });
    addItem(store, "Pet Supplies", {
      name: "Collapsible bowls",
      quantity: "1 set",
      reason: "Useful for food and water on long outing days",
      searchQuery: makeSearchQuery("collapsible pet bowls", ["travel"]),
    });
    addItem(store, "Pet Supplies", {
      name: "Vaccination records",
      quantity: "1 set",
      reason: "Important for lodging, flights, or emergency vet visits",
      searchQuery: makeSearchQuery("pet document organizer"),
    });
    addItem(store, "Pet Supplies", {
      name: "Favorite pet blanket",
      quantity: "1",
      reason: "Adds familiarity and comfort in a new environment",
      searchQuery: makeSearchQuery("pet travel blanket"),
    });
  }

  addTemplateExtras(store, climateZone, inferredTripType, { hasToddler, isRainy });

  return {
    categories: finalizeCategories(store),
  };
}
