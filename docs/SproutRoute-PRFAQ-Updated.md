# SproutRoute PRFAQ -- Updated

**Last Updated: April 2, 2026**

---

## PRESS RELEASE

### SproutRoute: The AI Trip Planner That Plans for Your Whole Family -- Kids, Pets, and All

SproutRoute is the only trip planner that handles your entire family -- children and pets -- in one place. It generates day-by-day itineraries backed by 1,452+ curated family attractions across 66+ cities, real-time weather forecasts, packing lists with shopping links, car seat law guidance, airline pet policies for six major carriers, and international pet entry requirements. Plans generate progressively -- the results screen appears in seconds while the full itinerary streams in the background.

---

### From 83 Seconds to Under 15: How SproutRoute Rebuilt Its AI Pipeline

SproutRoute, a free AI-powered trip planning tool designed for families with young children and pets, is live at [sproutroute-production.up.railway.app](https://sproutroute-production.up.railway.app). Built by product manager and engineer Nitish Prasad, SproutRoute has undergone a complete architectural transformation since its initial web MVP launch.

The original system relied on a single AI model (Claude Sonnet) running open-ended attraction reasoning for every trip request. This produced high-quality results but at a cost: 83-second average latency and $0.24 per trip in API costs. Over a series of engineering sprints, SproutRoute rebuilt its AI pipeline around three key innovations:

**Multi-model routing.** The runtime hot path now uses GPT-5.4 nano as the primary model ($0.003/trip, an 80x cost reduction), with Claude Haiku 4.5 as an automatic fallback. Claude Sonnet 4.6 is reserved for offline precompute work where latency does not affect users.

**Attraction intelligence layer.** Instead of asking the AI to reason about what exists in a city from scratch on every request, SproutRoute now maintains 1,452+ curated family attractions across 66+ cities in a Supabase PostgreSQL database. At runtime, cached attractions are loaded, ranked against the trip intent, and injected as a verified shortlist into the AI prompt. This eliminates the most expensive reasoning step.

**Progressive SSE rendering.** The results screen appears in approximately 2 seconds. The itinerary streams in the background (~14 seconds on GPT nano for typical trips). Packing lists, safety guidance, and pet checks run non-blocking after the itinerary arrives.

The result: p50 latency of 33.7 seconds (down from 83s), with best-case simple trips completing in 6-16 seconds. Zero request errors in the most recent sampled window. The system now runs on Supabase PostgreSQL (19 tables with row-level security), PostHog analytics with full funnel tracking and session recordings, and a custom ops dashboard at /ops for monitoring production metrics.

### The Problem: Families Are Still Juggling Too Many Tools

Over 100 million Americans take family vacations annually. At the same time, 68 million US households own dogs and 78% of pet owners travel with their animals. For families with both kids and pets, trip planning requires juggling 8-12 separate tools: maps, weather apps, blog posts for kid-friendly restaurants, state government websites for car seat laws, individual airline sites for pet policies, and government portals for international pet paperwork.

Existing travel planners like TripIt, Wanderlog, and Google Travel handle logistics for adult travelers but ignore family-specific needs. None surface car seat laws, generate age-appropriate packing lists, factor a toddler's nap schedule into an itinerary, or know whether a 20-pound golden retriever can fly cabin on Delta.

### The Solution: One Input, One Complete Family Plan

SproutRoute eliminates the research marathon. A parent types a free-text description of their trip -- destination, dates, kids, pets, preferences -- and SproutRoute generates a complete plan by orchestrating multiple AI models and APIs.

The system now includes:

- **Curated attractions:** 1,452+ family-friendly attractions across 66+ cities, precomputed offline and ranked at runtime
- **Profile memory:** Import travel preferences from ChatGPT, Claude, or Gemini by pasting JSON. Preferences merge with trip intent and guide future plans.
- **Progressive rendering:** See results immediately; itinerary streams in background
- **Multi-model AI:** GPT-5.4 nano for speed, Claude Haiku for reliability, Claude Sonnet for depth
- **Safety guidance:** Car seat laws, travel advisories, airline pet policies for 6 carriers, international pet entry requirements
- **Smart scheduling:** Cross-day dedup, 8 PM hard cap for family trips, dinner-only meal recommendations

### Quote from the Founder

"The hardest engineering problem in family trip planning is not generating an itinerary -- it is generating one fast enough that parents do not give up waiting," said Nitish Prasad, Founder of SproutRoute. "We went from 83-second average latency to under 34 seconds at p50 by fundamentally rethinking the AI pipeline. Instead of asking a large model to reason about every attraction in a city from scratch, we precompute that knowledge offline and give the runtime model a curated shortlist. The model's job shifts from 'discover what exists' to 'schedule what we already know is good.' That architectural change -- combined with switching to GPT-5.4 nano at $0.003 per trip -- made the difference."

### How It Works

1. **Type your trip.** Describe your destination, dates, family members (kids and pets), and any preferences in plain text.
2. **See results immediately.** The results screen appears in ~2 seconds with destination and weather. The itinerary streams in progressively.
3. **Get the full plan.** Day-by-day itinerary with curated attractions, weather-aware packing checklist, car seat guidance, pet safety, and shopping links -- all on one page.
4. **Save your preferences.** Import your travel profile from any AI assistant. Your preferences carry forward to future trips.

### Get Started Today

SproutRoute is completely free at [sproutroute-production.up.railway.app](https://sproutroute-production.up.railway.app). No account required. The iOS app is in development.

---

## FREQUENTLY ASKED QUESTIONS

---

### External FAQ (Customer-Facing)

**Q1: How much does SproutRoute cost?**

SproutRoute is completely free. There is no subscription, no Pro tier, and no feature gating. Revenue comes from affiliate product links in the packing list when families need to buy trip essentials.

**Q2: What destinations does SproutRoute support?**

SproutRoute has curated attraction data for 66+ cities and growing. The AI itinerary engine works for any destination with geocoding data. Weather data comes from Visual Crossing (global coverage). Car seat guidance covers all 50 US states plus international jurisdictions. Airline pet policies cover six major US carriers.

**Q3: How fast does it generate a plan?**

The results screen appears in approximately 2 seconds. The full itinerary typically completes in 15-35 seconds depending on trip complexity. Simple trips on GPT-5.4 nano can complete in 6-16 seconds. This is down from an 83-second average before the architecture overhaul.

**Q4: How accurate are the recommendations?**

Attractions come from a curated database of 1,452+ family-friendly venues verified through precompute and Google Places enrichment. Car seat laws, airline pet policies, and pet entry requirements are stored in human-reviewed databases. The AI schedules and contextualizes verified data rather than generating venue names from memory.

**Q5: Can I save my preferences?**

Yes. SproutRoute supports profile import from ChatGPT, Claude, or Gemini. Paste your travel profile JSON and SproutRoute normalizes it into an internal schema. Your preferences (pace, food, activities, constraints) merge with each trip request to personalize recommendations.

**Q6: Is my data private?**

Trip data is processed in real time and not retained after the session unless you create a profile. Supabase PostgreSQL with row-level security stores profile and trip data for signed-in users. PostHog analytics has PII masking enabled. SproutRoute does not sell user data.

**Q7: How does SproutRoute handle pets?**

When you mention pets in your trip input, SproutRoute generates pet-aware itineraries (pet-friendly badges, dog parks, pet daycare suggestions), a pet packing category, airline pet policies across six carriers (cabin/cargo eligibility, fees, breed restrictions), and international pet entry requirements (microchip, vaccination, quarantine, banned breeds).

**Q8: How is SproutRoute different from Google Travel, TripIt, or Wanderlog?**

No other product combines AI itineraries backed by 1,452+ curated attractions, real-time weather, packing lists, car seat compliance, airline pet policies, and international pet entry requirements in a single workflow. SproutRoute is also the only tool that handles kids and pets together as an integrated planning problem. And it is free.

---

### Internal FAQ (Business and Strategy)

**Q1: What is the current technical state?**

- **AI Pipeline:** GPT-5.4 nano primary ($0.003/trip), Claude Haiku 4.5 fallback, Claude Sonnet 4.6 offline precompute
- **Database:** Supabase PostgreSQL, 19 tables, RLS, 15+ migrations
- **Attraction Layer:** 1,452+ attractions across 66+ cities (Wave 1 and Wave 2 complete, Wave 3 in progress)
- **Latency:** p50 33.7s, avg 38.7s (down from 83s baseline); best case 6-16s
- **Testing:** 350 unit tests, 59 Playwright e2e tests, 0 request errors in sampled window
- **Security:** 13 OWASP findings fixed, 7 race conditions fixed, CVE patches applied
- **Analytics:** PostHog full funnel tracking + session recordings, PII masking enabled
- **Ops:** Custom dashboard at /ops with persistent Supabase metrics

**Q2: What was the model journey?**

The project started with Claude Sonnet as the sole AI model. This produced high-quality output but at $0.24/trip and ~83s latency. The PRD called for a migration to Gemini 3 Flash, which was implemented but later replaced. The current architecture uses GPT-5.4 nano as the primary runtime model at $0.003/trip (80x cost reduction from Sonnet). Claude Haiku 4.5 serves as automatic fallback. Claude Sonnet 4.6 handles offline attraction precompute where latency does not matter.

**Q3: How does the attraction intelligence layer work?**

Attractions are precomputed offline using Claude Sonnet 4.6 in waves: Wave 1 covered 15 major US and international cities, Wave 2 expanded to 20 more cities including India and Europe, and Wave 3 (in progress) targets the top 100 North American tourist destinations. At runtime, cached attractions are loaded from Supabase, ranked against the trip intent, and injected as a shortlist into the AI prompt. Demand-driven capture stores new attractions discovered during live trips. The freshness model classifies attractions as fresh, aging, stale, or unverified.

**Q4: What does the cost structure look like?**

API cost per trip: $0.003 on GPT-5.4 nano. Infrastructure: Railway hosting + Supabase (database and auth). Affiliate revenue from packing list shopping links provides the monetization path. Gross margins are approximately 90%+ at scale due to the low per-trip cost.

**Q5: What are the key metrics?**

- 1,452+ attractions across 66+ cities
- p50 latency: 33.7s, average: 38.7s
- Best case simple trips: 6-16s
- Cost per trip: $0.003 (GPT nano)
- 350 unit tests, 59 Playwright e2e tests
- 0 request errors in sampled window
- 13 OWASP findings fixed, 7 race conditions fixed

**Q6: What is the profile system?**

Users can import travel preferences by pasting JSON from ChatGPT, Claude, or Gemini. The system validates the input, normalizes it to an internal schema with confidence metadata, and presents a review UI. On subsequent trips, the profile is merged with the trip intent using deterministic precedence rules (safety constraints > explicit trip constraints > profile preferences). A compact planner summary (150-300 tokens) is injected into the AI prompt. The feedback endpoint captures preference signals for future refinement.

**Q7: What is the ops dashboard?**

The /ops route provides a custom dashboard showing persistent metrics from Supabase: trip generation latency breakdown, model usage, error rates, attraction coverage, and cost tracking. This enables real-time monitoring of production health without external tooling.
