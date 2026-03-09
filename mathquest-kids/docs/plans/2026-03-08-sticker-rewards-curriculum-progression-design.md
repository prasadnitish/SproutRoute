# Design: Sticker Rewards, K–2 Curriculum, Skill Trail, Parent Dashboard

**Date:** 2026-03-08
**Status:** Approved
**Trigger:** Daughter beta testing — missing kindergarten addition content, unclear progression, text-only reward screen

---

## Problem Summary

1. **Reward screen is underwhelming.** Session complete shows a system SF Symbol and `Text("Reward: \(summary.rewardTitle)")` — no visual excitement.
2. **Missing K content.** No addition units for kindergarten. Only subtraction stories and teen place value are playable.
3. **Progression is invisible.** After completing exercises the child has no clear view of what skill comes next or how far along they are.

---

## Approach

**Option B: Content-first, then UI.**
Expand K–2 curriculum JSON and playable units before building the reward and progression UI. This ensures the skill trail and sticker book reflect real, completable content on day one — no placeholder nodes.

Build order:
1. K–2 curriculum content (JSON + interaction templates)
2. Sticker book + reward splash
3. Child skill trail (Home screen)
4. Parent dashboard

---

## Section 1: K–2 Curriculum Content Foundation

### Current State
- `content-pack-v1.json`: 8 units, all grade 1–5 (subtraction, teen place value, comparisons, fractions, multiplication, decimals).
- `lesson-plans-k5.json`: K lessons exist but only 2 are `isPlayableInApp: true` — both subtraction/place value. Addition, counting, composing/decomposing are all `false` with no linked unit.

### New Playable Units (added to `content-pack-v1.json`)

| Unit ID | Grade | Skill | WA/CCSS Standard |
|---|---|---|---|
| `kAddWithin5` | K | Addition within 5 | K.OA.A.1, K.OA.A.2 |
| `kAddWithin10` | K | Addition within 10 | K.OA.A.2, K.OA.A.5 |
| `kCountObjects` | K | Count & match to 10 | K.CC.B.4, K.CC.B.5 |
| `kComposeDecompose` | K | Make 10 / number bonds | K.OA.A.3 |
| `g1AddWithin20` | G1 | Addition within 20 | 1.OA.A.1, 1.OA.C.6 |
| `g1FactFamilies` | G1 | Fact families | 1.OA.B.3, 1.OA.D.8 |
| `g2AddWithin100` | G2 | Add within 100 | 2.NBT.B.5, 2.NBT.B.7 |
| `g2SubWithin100` | G2 | Subtract within 100 | 2.NBT.B.5, 2.NBT.B.7 |

`lesson-plans-k5.json` updated: all 8 new units marked `isPlayableInApp: true` with matching `linkedUnit` IDs.

### Gameplay Interaction Pattern (Addition)
Tap-to-add picture groups (e.g., "3 frogs + 2 frogs = ?") — add-to semantics reusing the existing `SessionView` / `SessionRuntime` infrastructure. Mirrors the subtraction stories template.

---

## Section 2: Sticker Book & Reward Splash

### Sticker Unlock Model
- One sticker per completed unit (skill pack).
- 8 existing units + 8 new units = 16 stickers total for K–2.
- Stickers persisted to Core Data (`StickerRecord`). Permanent — never lost.

### Reward Splash Screen
Replaces the current `SessionSummaryView` card on pack completion:
- Full-screen overlay fires before the summary
- Sticker scales in from center with spring animation + confetti/sparkle particles
- Character voice line: "You earned the Frog Friends sticker!"
- Tap anywhere to dismiss → normal session summary
- Reduced-motion: sticker fades in, no particles, no spring

### Sticker Book Screen (new destination from Home)
- Grid of sticker slots, ordered by grade (K → G1 → G2)
- **Unlocked:** full-color sticker + unit name + date earned (on tap)
- **Locked:** grayscale silhouette + lock icon + "Complete [unit name] to unlock"
- Tapping a locked sticker navigates into that unit — doubles as a progression entry point

### Art Strategy
Assets named `sticker-[unitId]` in `Assets.xcassets`. Launch: bold SF Symbols in app color palette. Real illustrations swapped in later with no code changes.

### New Files
- `Features/Rewards/StickerBookView.swift`
- `Features/Rewards/RewardSplashView.swift`
- `Domain/StickerModels.swift` — `Sticker`, `StickerCollection`
- Core Data entity: `StickerRecord` (unitId, dateEarned)

---

## Section 3: Child-Facing Skill Trail

### Location
Replaces the "recommended lessons" text in `HomeView`. Becomes the primary content area.

### Visual Design
Scrollable vertical path — stepping stones / winding trail — one node per unit, grouped by grade. Grade boundaries marked with a milestone header ("Grade 1 ⭐").

### Node States
| State | Visual |
|---|---|
| Locked | Grayed stone, lock icon |
| Available | Colored, pulsing ring |
| In Progress | Colored, circular mastery % fill |
| Completed | Full color + sticker thumbnail |
| Mastered | Gold border + star badge |

### Unlock Logic
Units unlock sequentially within a grade. All K units complete → Grade 1 units unlock. `AdaptiveLessonPlanner` highlights the recommended next unit with a subtle glow — guides without locking out other available units.

### New Files
- `Features/Home/SkillTrailView.swift`
- `Features/Home/SkillTrailNode.swift`
- `Domain/SkillTrailModels.swift` — `TrailNode`, `NodeState`

`HomeView.swift` updated to embed `SkillTrailView`.

---

## Section 4: Parent Dashboard

### Access
Behind existing parent gate. New "Progress Report" button in `SettingsView` → PIN → dashboard.

### Dashboard Layout (single scrollable screen)

**Header:** Child name, current grade placement, streak, last active date.

**Domain coverage grid:** One card per math domain:
- Counting & Cardinality
- Operations & Algebraic Thinking
- Number & Operations in Base Ten
- Geometry

Each card: skills covered / total, horizontal fill bar, tap to expand with per-skill status (mastered / in-progress / not started).

**Recent activity:** Last 7 sessions — date, unit name, score (e.g., "Mon · Addition Within 10 · 8/10 correct").

**Weak spots callout:** Domain under 40% accuracy over last 5 sessions → highlighted card with direct link to a support lesson.

**Standards note:** "Curriculum aligned to Washington State K–2 Math Learning Standards (CCSS-based)" — parent confidence line.

### New Files
- `Features/Settings/ParentDashboardView.swift`
- `Features/Settings/DomainCoverageCard.swift`
- `Services/ProgressReportService.swift` — aggregates Core Data records into report model
- `Domain/ProgressReportModels.swift` — `DomainReport`, `WeeklyActivity`, `ProgressReport`

---

## Files Modified (existing)
- `MathQuestKids/Content/content-pack-v1.json` — 8 new units
- `MathQuestKids/Content/lesson-plans-k5.json` — update `isPlayableInApp` + `linkedUnit` for new units
- `MathQuestKids/Features/Home/HomeView.swift` — embed skill trail
- `MathQuestKids/Features/Session/SessionSummaryView.swift` — trigger reward splash on pack complete
- `MathQuestKids/Features/Settings/SettingsView.swift` — add Progress Report button

## Definition of Done
- [ ] `npm test` equivalent — all Swift unit/UI tests green
- [ ] All 8 new units playable end-to-end in simulator
- [ ] Sticker unlocks and persists across app restarts
- [ ] Skill trail reflects live mastery state from Core Data
- [ ] Parent dashboard accessible behind parent gate
- [ ] Reduced-motion respected on reward splash
- [ ] Accessibility: all new interactive elements have `accessibilityLabel`
- [ ] WA standards IDs verified against OSPI / Bellevue SD scope-and-sequence
