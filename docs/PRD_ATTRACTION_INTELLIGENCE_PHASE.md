# Product Requirements Document: Attraction Intelligence Layer and Demand-Driven Storage

**Last Updated: April 2, 2026**

**Project Name:** SproutRoute
**Phase:** Attraction Intelligence Layer
**Version:** 2.0
**Date:** March 29, 2026 (originally); updated April 2, 2026
**Status:** Largely implemented -- see Current Status section below

---

## Current Status (as of April 2, 2026)

The attraction intelligence layer is live in production:

- **1,452+ curated attractions** across **66+ cities** in Supabase PostgreSQL
- **All database tables created and migrated** (cities, city_attractions, city_attraction_tags, attraction_precompute_runs, attraction_verification_cache)
- **Demand-driven capture:** Live -- attractions from trip generation are stored for reuse
- **Canonicalization:** Live -- name normalization and city-level dedupe rules active
- **Freshness ranking:** Live -- fresh / aging / stale / unverified classification
- **Runtime shortlist injection:** Live -- up to 20 cached attractions per city ranked and injected into AI prompt
- **Wave 1 (15 cities):** Complete (US major + international)
- **Wave 2 (20 cities):** Complete (expanded US + India + Europe)
- **Wave 3 (62 cities):** In progress (top 100 NA tourist destinations)
- **Precompute model:** Claude Sonnet 4.6 (offline)
- **Runtime model:** GPT-5.4 nano (primary, $0.003/trip), Claude Haiku 4.5 (fallback)
- **Latency:** p50 33.7s, avg 38.7s (down from 83s baseline); best case 6-16s
- **Cross-day dedup, 8 PM hard cap, dinner-only meals:** All active

---

## Executive Summary

SproutRoute should add an attraction intelligence layer that reduces live trip-generation latency and improves recommendation quality by combining:

- demand-driven storage of attractions already generated during live trips
- a freshness and verification model for reusing prior work
- a selective offline precompute system for high-priority destinations
- runtime ranking plus lightweight live verification before itinerary generation

This phase is intentionally narrower than the full profile-memory roadmap. The focus here is on building a reusable attraction graph from real usage and targeted precompute, especially for likely early-user destinations in the United States and India.

---

## Problem Statement

Today, the trip planner spends too much runtime effort doing open-ended attraction reasoning:

- inventing what attractions exist in a destination
- inferring which ones are family-relevant
- deciding what may fit the family
- doing this repeatedly for the same destinations

This creates:

- high latency
- inconsistent destination quality
- repeated model cost for the same city
- no durable memory of what was already generated and verified

---

## Goals

1. Reuse attraction work already generated in prior trips
2. Reduce itinerary generation latency for repeat destinations
3. Build a SproutRoute-owned attraction graph over time
4. Prioritize destinations most likely to matter to early users
5. Avoid large upfront precompute spend before demand is proven

---

## Non-Goals

- full global attraction coverage
- perfect editorial coverage of every city on day 1
- permanent storage of third-party live operational facts as source of truth
- a complete replacement for Places verification

---

## Core Product Strategy

This phase should use a 3-part strategy:

### 1. Demand-Driven Attraction Memory

Store every attraction the user sees if it is useful enough to be reused later.

This is the cheapest and fastest bootstrap path.

### 2. Smart Seed Precompute

Precompute only a narrow seed set of high-likelihood destinations based on:

- first tester geography
- likely family travel patterns
- domestic and international demand from US and India

### 3. Runtime Verification

At runtime, use stored attraction candidates first, rank them for the current trip, then verify only the top shortlist with live place data before itinerary generation.

---

## User Outcomes

Users should experience:

- faster trip generation for popular destinations
- more consistent attraction quality
- less generic itinerary content
- better family-fit attraction suggestions

---

## Destination Prioritization Strategy

This phase should not start with “top 500 cities in the world.”

It should start with:

- likely destinations for West Coast US testers
- likely destinations for East Coast US testers
- likely domestic and outbound destinations for India-based users

Priority should be based on:

1. likely user demand
2. family travel relevance
3. repeatability
4. latency pain
5. strategic expansion value

---

## Destination Waves

These destinations are the recommended rollout sequence for this phase.

### Wave 1: Highest-Confidence Early Destinations

Wave 1 should be the smallest useful set with the highest probability of repeat demand from:

- West Coast US testers
- East Coast US testers
- early India-origin leisure and outbound demand

#### Wave 1A: West Coast US

1. San Diego
2. Los Angeles
3. Anaheim / Orange County
4. San Francisco
5. Seattle

#### Wave 1B: East Coast and National Family Demand

6. Orlando
7. New York City
8. Washington, DC
9. Miami
10. Chicago

#### Wave 1C: Early International from US and India

11. London
12. Tokyo
13. Dubai
14. Singapore
15. Bali / Denpasar

### Why Wave 1 Exists

Wave 1 is the validation wave. It should prove:

- attraction reuse works
- precompute quality is worth the effort
- seeded destinations produce better latency and recommendation quality than fully open-ended generation

### Wave 2: Expanded Seed Destinations

Wave 2 should extend to a broader but still controlled destination set after Wave 1 proves value.

#### Wave 2A: Additional US West and Nearby Destinations

16. Santa Barbara
17. Monterey / Carmel
18. Lake Tahoe
19. Portland
20. Honolulu / Oahu

#### Wave 2B: Additional US East and High-Demand Family Destinations

21. Boston
22. Philadelphia
23. Atlanta
24. Charleston
25. Niagara Falls / Buffalo

#### Wave 2C: Additional US Outbound Family International Destinations

26. Paris
27. Rome
28. Vancouver
29. Toronto
30. Cancun
31. Mexico City
32. Barcelona

#### Wave 2D: India Domestic Family Destinations

33. Goa
34. Jaipur
35. Udaipur
36. Kochi
37. Mysuru
38. Ooty
39. Coorg / Madikeri
40. Munnar

### Why Wave 2 Exists

Wave 2 broadens coverage only after:

- attraction reuse from trip generation is stable
- ranking and verification are working
- Wave 1 seeded cities show measurable latency improvements

### Wave 3: Strategic Long-Tail Expansion

Wave 3 should cover the remaining destinations in the original seed shortlist plus newly promoted cities.

#### Wave 3A: India Domestic and Regional Expansion

41. Shimla
42. Rishikesh
43. Kuala Lumpur
44. Phuket
45. Hong Kong

#### Wave 3B: Demand-Promoted Cities

Additional cities should enter Wave 3 only if promoted by real usage.

### Promotion Rule

A destination should move into full precompute if it meets one or more of the following:

- 10 or more trip requests in 30 days
- repeated search by 3 or more distinct users
- poor live generation quality
- high itinerary latency
- strategic launch relevance

### Budget Control Rule

Do not start Wave 2 until Wave 1 shows:

- measurable latency improvement
- healthy verification success rate
- attraction reuse in repeat destinations

Do not start Wave 3 until Wave 2 shows the same.

---

## Demand-Driven Storage Requirements

SproutRoute should store attraction candidates produced during trip generation.

This includes attractions that:

- appear in suggested activities
- appear in itinerary days
- are enriched or verified during the trip flow

### What Should Be Stored

- destination or canonical city
- attraction name
- category
- short summary
- tags if available
- source trip request ID
- whether it was shown to the user
- whether it was selected into itinerary
- whether it was verified
- place ID if resolved
- freshness score
- last seen timestamp
- confidence score

### Why This Matters

This allows SproutRoute to:

- reuse prior attraction work for the same city
- build coverage from real demand
- reduce future model work
- identify which destinations deserve offline precompute

---

## Freshness Model

Each stored attraction should have both a freshness state and a freshness score.

### Freshness States

- `fresh`
- `stale`
- `unverified`
- `rejected`

### Freshness Logic

- verified within 7 days -> `fresh`
- verified within 30 days -> still usable but lower ranked
- older verification -> `stale`, should be rechecked if shortlisted
- never verified -> `unverified`, usable only as a lower-confidence candidate
- failed verification or rejected candidate -> `rejected`, do not surface

---

## Offline Precompute Requirements

This phase should add a selective offline precompute pipeline.

### Offline LLM Tasks

- discover family-relevant attractions
- tag attractions by age suitability
- infer stroller friendliness
- infer indoor/outdoor classification
- estimate visit duration
- infer rainy-day fit
- infer crowd level
- infer budget tier
- generate compact editorial summaries

### Practical Rule

Do not precompute every city up front.
Precompute only the shortlist above plus newly promoted destinations from observed demand.

---

## Runtime Flow

For a supported destination:

1. resolve destination to canonical city
2. load stored attractions from demand-driven memory
3. load precomputed attractions if available
4. merge and dedupe
5. rank against current trip constraints
6. verify only the top shortlist live
7. pass only verified shortlist into itinerary generation

If no attraction memory or precompute exists:

1. use live trip generation
2. store the resulting attractions after generation

---

## Success Metrics

### Product Metrics

- repeat destination response time improvement
- share of itinerary attractions sourced from stored candidates
- share of itinerary attractions sourced from verified candidates
- destination coverage growth over time

### Engineering Metrics

- p50 and p95 itinerary latency for seeded destinations
- average number of live place verifications per trip
- verification hit rate
- attraction reuse rate
- demand-to-precompute promotion rate

---

## Acceptance Criteria

- [x] attractions shown during trip generation are stored for reuse
- [x] freshness state and score are tracked per attraction
- [x] seeded destinations are available in the first precompute wave (Wave 1: 15 cities complete)
- [x] runtime planner can reuse stored or precomputed candidates
- [x] runtime planner verifies only the top shortlist live (up to 20 per city)
- [x] seeded destinations show a measurable latency improvement versus fully open-ended generation (p50 33.7s vs 83s baseline)

---

## Recommendation

Build this phase in the following order:

1. demand-driven attraction storage from trip generation
2. freshness and canonicalization layer
3. shortlist-based precompute for the 50 destinations above
4. runtime ranking and verification
5. iterative expansion based on observed demand
