# Sticker Rewards, K–2 Curriculum, Skill Trail & Parent Dashboard

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add kindergarten/G1/G2 math content (WA-aligned), a collectible sticker book with a full-screen reward splash, a child-facing skill trail on Home, and a parent progress dashboard behind the parent gate.

**Architecture:** Content-first (Option B). Expand `content-pack-v1.json` and `lesson-plans-k5.json` with 8 new playable units, then build reward/progression UI on top of real data. Sticker unlocks persist in Core Data (`CDStickerRecord`). The skill trail replaces the unit grid on `HomeView`. Parent dashboard lives behind the existing parent gate in `SettingsView`.

**Tech Stack:** Swift 5.9, SwiftUI, Swift Testing (`@Test` / `#expect`), Core Data (programmatic or xcdatamodeld — match existing pattern in `CoreDataStack.swift`), `AVSpeechSynthesizer` (existing `NarrationService`), `Assets.xcassets` for sticker art slots.

---

## PHASE 1 — K–2 Content Foundation

---

### Task 1: Add New UnitType Cases and ItemFormat Cases

**Files:**
- Modify: `MathQuestKids/Domain/Models.swift`

These enums gate everything downstream. Add all new cases first so the compiler catches every switch that needs updating.

**Step 1: Open `MathQuestKids/Domain/Models.swift` and extend `UnitType`**

Add 8 new cases after `.volumeAndDecimals`:

```swift
// In enum UnitType
case kAddWithin5
case kAddWithin10
case kCountObjects
case kComposeDecompose
case g1AddWithin20
case g1FactFamilies
case g2AddWithin100
case g2SubWithin100
```

Add them to `learningPath` in grade order (before the existing Grade 1–5 units):

```swift
static var learningPath: [UnitType] {
    [
        // Kindergarten
        .kCountObjects,
        .kComposeDecompose,
        .kAddWithin5,
        .kAddWithin10,
        // Grade 1
        .g1AddWithin20,
        .g1FactFamilies,
        // Grade 2
        .g2AddWithin100,
        .g2SubWithin100,
        // Existing Grade 1–5
        .subtractionStories,
        .teenPlaceValue,
        .twoDigitComparison,
        .threeDigitComparison,
        .multiplicationArrays,
        .fractionComparison,
        .fractionOfWhole,
        .volumeAndDecimals
    ]
}
```

Add `title`, `subtitle`, and `gradeHint` for each new case:

```swift
// title
case .kCountObjects:      return "Count & Match"
case .kComposeDecompose:  return "Number Bonds to 10"
case .kAddWithin5:        return "Addition Within 5"
case .kAddWithin10:       return "Addition Within 10"
case .g1AddWithin20:      return "Addition Within 20"
case .g1FactFamilies:     return "Fact Families"
case .g2AddWithin100:     return "Add Within 100"
case .g2SubWithin100:     return "Subtract Within 100"

// subtitle
case .kCountObjects:      return "Count and match objects to numbers"
case .kComposeDecompose:  return "Find pairs of numbers that make 10"
case .kAddWithin5:        return "Put groups together within 5"
case .kAddWithin10:       return "Add groups and count the total"
case .g1AddWithin20:      return "Add with pictures and equations"
case .g1FactFamilies:     return "Relate addition and subtraction"
case .g2AddWithin100:     return "Add two-digit numbers"
case .g2SubWithin100:     return "Subtract two-digit numbers"

// gradeHint
case .kCountObjects, .kComposeDecompose, .kAddWithin5, .kAddWithin10: return "K"
case .g1AddWithin20, .g1FactFamilies: return "1"
case .g2AddWithin100, .g2SubWithin100: return "2"
```

**Step 2: Add new `ItemFormat` cases**

```swift
// In enum ItemFormat
case additionStory    // addend + addend = ? (K and G1)
case countAndMatch    // count dots/objects to select numeral (K)
case numberBond       // fill the missing part that makes 10 (K)
case factFamily       // given whole + one part, find missing part (G1)
case addTwoDigit      // column addition within 100 (G2)
case subTwoDigit      // column subtraction within 100 (G2)
```

**Step 3: Build and fix any exhaustive switch errors**

```bash
xcodebuild build -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | grep -E "error:|warning:" | head -40
```

Fix every switch exhaustiveness error by adding the new cases. Follow the pattern of the nearest existing case in each switch. (SessionView will need cases for the new formats — for now have them fall through to a placeholder `Text("Coming soon")` view so the build compiles.)

**Step 4: Run all tests — they should still pass**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | tail -20
```

Expected: All existing tests pass (no behaviour changed yet).

**Step 5: Commit**

```bash
git add MathQuestKids/Domain/Models.swift
git commit -m "feat: add K-G2 UnitType and ItemFormat cases"
```

---

### Task 2: Add K Counting & Number Bond Units to content-pack-v1.json

**Files:**
- Modify: `MathQuestKids/Content/content-pack-v1.json`

**Step 1: Write a failing test**

In `MathQuestKidsTests/MathQuestKidsTests.swift`, add:

```swift
@Test
func kContentPackHasCountAndBondUnits() throws {
    let pack = try ContentLoader.loadDefaultPack()
    let unitIDs = Set(pack.units.map(\.id))
    #expect(unitIDs.contains(UnitType.kCountObjects))
    #expect(unitIDs.contains(UnitType.kComposeDecompose))
    let countTemplates = pack.templates(for: .kCountObjects)
    let bondTemplates = pack.templates(for: .kComposeDecompose)
    #expect(countTemplates.count >= 5)
    #expect(bondTemplates.count >= 5)
}
```

**Step 2: Run test to verify it fails**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  -only-testing:MathQuestKidsTests/MathQuestKidsTests/kContentPackHasCountAndBondUnits \
  2>&1 | tail -10
```

Expected: FAIL — units not in JSON yet.

**Step 3: Add units, lessons, and item templates to `content-pack-v1.json`**

In the `"units"` array, append:

```json
{ "id": "kCountObjects",     "title": "Count & Match",       "order": 9  },
{ "id": "kComposeDecompose", "title": "Number Bonds to 10",  "order": 10 }
```

In the `"lessons"` array, append:

```json
{
  "id": "k-count-01", "unit": "kCountObjects",
  "title": "Count Objects to 10", "skill": "count_objects_10"
},
{
  "id": "k-bond-01", "unit": "kComposeDecompose",
  "title": "Number Bonds to 10", "skill": "number_bond_10"
}
```

In the `"itemTemplates"` array, append (5 count items + 5 bond items):

```json
{
  "id": "cnt-01", "unit": "kCountObjects", "skill": "count_objects_10",
  "format": "countAndMatch", "difficulty": 1,
  "prompt": "How many dots? Tap the number.",
  "answer": "3", "supports": ["counters"],
  "payload": { "target": 3 }
},
{
  "id": "cnt-02", "unit": "kCountObjects", "skill": "count_objects_10",
  "format": "countAndMatch", "difficulty": 1,
  "prompt": "How many dots? Tap the number.",
  "answer": "5", "supports": ["counters"],
  "payload": { "target": 5 }
},
{
  "id": "cnt-03", "unit": "kCountObjects", "skill": "count_objects_10",
  "format": "countAndMatch", "difficulty": 1,
  "prompt": "How many dots? Tap the number.",
  "answer": "7", "supports": ["counters"],
  "payload": { "target": 7 }
},
{
  "id": "cnt-04", "unit": "kCountObjects", "skill": "count_objects_10",
  "format": "countAndMatch", "difficulty": 1,
  "prompt": "How many dots? Tap the number.",
  "answer": "9", "supports": ["counters"],
  "payload": { "target": 9 }
},
{
  "id": "cnt-05", "unit": "kCountObjects", "skill": "count_objects_10",
  "format": "countAndMatch", "difficulty": 2,
  "prompt": "How many dots? Tap the number.",
  "answer": "10", "supports": ["counters"],
  "payload": { "target": 10 }
},
{
  "id": "bnd-01", "unit": "kComposeDecompose", "skill": "number_bond_10",
  "format": "numberBond", "difficulty": 1,
  "prompt": "? and 7 make 10. What is ?",
  "answer": "3", "supports": ["tenFrame"],
  "payload": { "left": null, "right": 7, "target": 10 }
},
{
  "id": "bnd-02", "unit": "kComposeDecompose", "skill": "number_bond_10",
  "format": "numberBond", "difficulty": 1,
  "prompt": "4 and ? make 10. What is ?",
  "answer": "6", "supports": ["tenFrame"],
  "payload": { "left": 4, "right": null, "target": 10 }
},
{
  "id": "bnd-03", "unit": "kComposeDecompose", "skill": "number_bond_10",
  "format": "numberBond", "difficulty": 1,
  "prompt": "? and 5 make 10. What is ?",
  "answer": "5", "supports": ["tenFrame"],
  "payload": { "left": null, "right": 5, "target": 10 }
},
{
  "id": "bnd-04", "unit": "kComposeDecompose", "skill": "number_bond_10",
  "format": "numberBond", "difficulty": 1,
  "prompt": "8 and ? make 10. What is ?",
  "answer": "2", "supports": ["tenFrame"],
  "payload": { "left": 8, "right": null, "target": 10 }
},
{
  "id": "bnd-05", "unit": "kComposeDecompose", "skill": "number_bond_10",
  "format": "numberBond", "difficulty": 2,
  "prompt": "? and 1 make 10. What is ?",
  "answer": "9", "supports": ["tenFrame"],
  "payload": { "left": null, "right": 1, "target": 10 }
}
```

**Step 4: Also add rewards for these units in the `"rewards"` array:**

```json
{ "id": "reward-kcount",   "title": "Counting Star",    "description": "Awarded for completing Count & Match" },
{ "id": "reward-kbond",    "title": "Number Bond Badge", "description": "Awarded for completing Number Bonds to 10" }
```

**Step 5: Run test to verify it passes**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  -only-testing:MathQuestKidsTests/MathQuestKidsTests/kContentPackHasCountAndBondUnits \
  2>&1 | tail -10
```

Expected: PASS.

**Step 6: Run all tests**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | tail -20
```

Expected: All pass.

**Step 7: Commit**

```bash
git add MathQuestKids/Content/content-pack-v1.json MathQuestKidsTests/MathQuestKidsTests.swift
git commit -m "feat: add K counting and number bond content to content pack"
```

---

### Task 3: Add K Addition and G1 Addition Units

**Files:**
- Modify: `MathQuestKids/Content/content-pack-v1.json`

**Step 1: Write failing tests**

```swift
@Test
func kAndG1AdditionUnitsExistInPack() throws {
    let pack = try ContentLoader.loadDefaultPack()
    let unitIDs = Set(pack.units.map(\.id))
    #expect(unitIDs.contains(UnitType.kAddWithin5))
    #expect(unitIDs.contains(UnitType.kAddWithin10))
    #expect(unitIDs.contains(UnitType.g1AddWithin20))
    #expect(unitIDs.contains(UnitType.g1FactFamilies))
    #expect(pack.templates(for: .kAddWithin5).count >= 5)
    #expect(pack.templates(for: .kAddWithin10).count >= 5)
    #expect(pack.templates(for: .g1AddWithin20).count >= 5)
    #expect(pack.templates(for: .g1FactFamilies).count >= 5)
}
```

**Step 2: Verify it fails, then add to `content-pack-v1.json`**

Units to add:

```json
{ "id": "kAddWithin5",  "title": "Addition Within 5",   "order": 11 },
{ "id": "kAddWithin10", "title": "Addition Within 10",  "order": 12 },
{ "id": "g1AddWithin20","title": "Addition Within 20",  "order": 13 },
{ "id": "g1FactFamilies","title": "Fact Families",      "order": 14 }
```

Lessons:

```json
{ "id": "k-add5-01",  "unit": "kAddWithin5",   "title": "Add Within 5",  "skill": "add_within_5"  },
{ "id": "k-add10-01", "unit": "kAddWithin10",  "title": "Add Within 10", "skill": "add_within_10" },
{ "id": "g1-add20-01","unit": "g1AddWithin20", "title": "Add Within 20", "skill": "add_within_20" },
{ "id": "g1-fact-01", "unit": "g1FactFamilies","title": "Fact Families",  "skill": "fact_family"   }
```

Item templates — add 5 items for each unit using `additionStory` format:

```json
{ "id": "add5-01", "unit": "kAddWithin5", "skill": "add_within_5",
  "format": "additionStory", "difficulty": 1,
  "prompt": "2 + 1 = ?", "answer": "3", "supports": ["counters"],
  "payload": { "left": 2, "right": 1, "target": 3 } },
{ "id": "add5-02", "unit": "kAddWithin5", "skill": "add_within_5",
  "format": "additionStory", "difficulty": 1,
  "prompt": "1 + 3 = ?", "answer": "4", "supports": ["counters"],
  "payload": { "left": 1, "right": 3, "target": 4 } },
{ "id": "add5-03", "unit": "kAddWithin5", "skill": "add_within_5",
  "format": "additionStory", "difficulty": 1,
  "prompt": "2 + 2 = ?", "answer": "4", "supports": ["counters"],
  "payload": { "left": 2, "right": 2, "target": 4 } },
{ "id": "add5-04", "unit": "kAddWithin5", "skill": "add_within_5",
  "format": "additionStory", "difficulty": 1,
  "prompt": "3 + 2 = ?", "answer": "5", "supports": ["counters"],
  "payload": { "left": 3, "right": 2, "target": 5 } },
{ "id": "add5-05", "unit": "kAddWithin5", "skill": "add_within_5",
  "format": "additionStory", "difficulty": 2,
  "prompt": "1 + 4 = ?", "answer": "5", "supports": ["counters"],
  "payload": { "left": 1, "right": 4, "target": 5 } },

{ "id": "add10-01", "unit": "kAddWithin10", "skill": "add_within_10",
  "format": "additionStory", "difficulty": 1,
  "prompt": "4 + 3 = ?", "answer": "7", "supports": ["counters"],
  "payload": { "left": 4, "right": 3, "target": 7 } },
{ "id": "add10-02", "unit": "kAddWithin10", "skill": "add_within_10",
  "format": "additionStory", "difficulty": 1,
  "prompt": "5 + 2 = ?", "answer": "7", "supports": ["counters"],
  "payload": { "left": 5, "right": 2, "target": 7 } },
{ "id": "add10-03", "unit": "kAddWithin10", "skill": "add_within_10",
  "format": "additionStory", "difficulty": 1,
  "prompt": "3 + 5 = ?", "answer": "8", "supports": ["counters"],
  "payload": { "left": 3, "right": 5, "target": 8 } },
{ "id": "add10-04", "unit": "kAddWithin10", "skill": "add_within_10",
  "format": "additionStory", "difficulty": 2,
  "prompt": "6 + 4 = ?", "answer": "10", "supports": ["counters"],
  "payload": { "left": 6, "right": 4, "target": 10 } },
{ "id": "add10-05", "unit": "kAddWithin10", "skill": "add_within_10",
  "format": "additionStory", "difficulty": 2,
  "prompt": "7 + 3 = ?", "answer": "10", "supports": ["counters"],
  "payload": { "left": 7, "right": 3, "target": 10 } },

{ "id": "add20-01", "unit": "g1AddWithin20", "skill": "add_within_20",
  "format": "additionStory", "difficulty": 1,
  "prompt": "8 + 5 = ?", "answer": "13", "supports": ["numberLine"],
  "payload": { "left": 8, "right": 5, "target": 13 } },
{ "id": "add20-02", "unit": "g1AddWithin20", "skill": "add_within_20",
  "format": "additionStory", "difficulty": 1,
  "prompt": "9 + 4 = ?", "answer": "13", "supports": ["numberLine"],
  "payload": { "left": 9, "right": 4, "target": 13 } },
{ "id": "add20-03", "unit": "g1AddWithin20", "skill": "add_within_20",
  "format": "additionStory", "difficulty": 1,
  "prompt": "7 + 6 = ?", "answer": "13", "supports": ["numberLine"],
  "payload": { "left": 7, "right": 6, "target": 13 } },
{ "id": "add20-04", "unit": "g1AddWithin20", "skill": "add_within_20",
  "format": "additionStory", "difficulty": 2,
  "prompt": "9 + 8 = ?", "answer": "17", "supports": ["numberLine"],
  "payload": { "left": 9, "right": 8, "target": 17 } },
{ "id": "add20-05", "unit": "g1AddWithin20", "skill": "add_within_20",
  "format": "additionStory", "difficulty": 2,
  "prompt": "8 + 9 = ?", "answer": "17", "supports": ["numberLine"],
  "payload": { "left": 8, "right": 9, "target": 17 } },

{ "id": "fact-01", "unit": "g1FactFamilies", "skill": "fact_family",
  "format": "factFamily", "difficulty": 1,
  "prompt": "6 + ? = 9", "answer": "3", "supports": ["numberLine"],
  "payload": { "left": 6, "right": null, "target": 9 } },
{ "id": "fact-02", "unit": "g1FactFamilies", "skill": "fact_family",
  "format": "factFamily", "difficulty": 1,
  "prompt": "? + 4 = 7", "answer": "3", "supports": ["numberLine"],
  "payload": { "left": null, "right": 4, "target": 7 } },
{ "id": "fact-03", "unit": "g1FactFamilies", "skill": "fact_family",
  "format": "factFamily", "difficulty": 1,
  "prompt": "5 + ? = 12", "answer": "7", "supports": ["numberLine"],
  "payload": { "left": 5, "right": null, "target": 12 } },
{ "id": "fact-04", "unit": "g1FactFamilies", "skill": "fact_family",
  "format": "factFamily", "difficulty": 2,
  "prompt": "? + 8 = 15", "answer": "7", "supports": ["numberLine"],
  "payload": { "left": null, "right": 8, "target": 15 } },
{ "id": "fact-05", "unit": "g1FactFamilies", "skill": "fact_family",
  "format": "factFamily", "difficulty": 2,
  "prompt": "9 + ? = 17", "answer": "8", "supports": ["numberLine"],
  "payload": { "left": 9, "right": null, "target": 17 } }
```

Add rewards:

```json
{ "id": "reward-kadd5",  "title": "Frog Friends Sticker", "description": "Complete Addition Within 5" },
{ "id": "reward-kadd10", "title": "Rainbow Star",          "description": "Complete Addition Within 10" },
{ "id": "reward-g1add20","title": "Number Hero Badge",     "description": "Complete Addition Within 20" },
{ "id": "reward-g1fact", "title": "Fact Family Trophy",    "description": "Complete Fact Families" }
```

**Step 3: Run test to verify pass, then run all tests**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add MathQuestKids/Content/content-pack-v1.json MathQuestKidsTests/MathQuestKidsTests.swift
git commit -m "feat: add K addition and G1 fact families content"
```

---

### Task 4: Add G2 Units + Update lesson-plans-k5.json

**Files:**
- Modify: `MathQuestKids/Content/content-pack-v1.json`
- Modify: `MathQuestKids/Content/lesson-plans-k5.json`

**Step 1: Write failing tests**

```swift
@Test
func g2UnitsExistInPack() throws {
    let pack = try ContentLoader.loadDefaultPack()
    let unitIDs = Set(pack.units.map(\.id))
    #expect(unitIDs.contains(UnitType.g2AddWithin100))
    #expect(unitIDs.contains(UnitType.g2SubWithin100))
    #expect(pack.templates(for: .g2AddWithin100).count >= 5)
    #expect(pack.templates(for: .g2SubWithin100).count >= 5)
}

@Test
func lessonPlanKindergartenAdditionIsPlayable() throws {
    let catalog = try CurriculumService.loadDefaultCatalog()
    let kLessons = catalog.lessons(for: .kindergarten)
    let playable = kLessons.filter(\.isPlayableInApp)
    let domains = Set(playable.map(\.domain.rawValue))
    #expect(domains.contains("operationsAlgebraicThinking"))
    #expect(playable.count >= 4)
}
```

**Step 2: Add G2 units to `content-pack-v1.json`**

Units:

```json
{ "id": "g2AddWithin100", "title": "Add Within 100",      "order": 15 },
{ "id": "g2SubWithin100", "title": "Subtract Within 100", "order": 16 }
```

Lessons:

```json
{ "id": "g2-add100-01", "unit": "g2AddWithin100", "title": "Add Two-Digit Numbers", "skill": "add_2digit" },
{ "id": "g2-sub100-01", "unit": "g2SubWithin100", "title": "Subtract Two-Digit Numbers", "skill": "sub_2digit" }
```

Item templates (5 each, using `addTwoDigit` / `subTwoDigit` format):

```json
{ "id": "a2d-01", "unit": "g2AddWithin100", "skill": "add_2digit",
  "format": "addTwoDigit", "difficulty": 1,
  "prompt": "23 + 14 = ?", "answer": "37", "supports": ["placeValueMat"],
  "payload": { "left": 23, "right": 14, "target": 37 } },
{ "id": "a2d-02", "unit": "g2AddWithin100", "skill": "add_2digit",
  "format": "addTwoDigit", "difficulty": 1,
  "prompt": "31 + 25 = ?", "answer": "56", "supports": ["placeValueMat"],
  "payload": { "left": 31, "right": 25, "target": 56 } },
{ "id": "a2d-03", "unit": "g2AddWithin100", "skill": "add_2digit",
  "format": "addTwoDigit", "difficulty": 2,
  "prompt": "47 + 36 = ?", "answer": "83", "supports": ["placeValueMat"],
  "payload": { "left": 47, "right": 36, "target": 83 } },
{ "id": "a2d-04", "unit": "g2AddWithin100", "skill": "add_2digit",
  "format": "addTwoDigit", "difficulty": 2,
  "prompt": "55 + 38 = ?", "answer": "93", "supports": ["placeValueMat"],
  "payload": { "left": 55, "right": 38, "target": 93 } },
{ "id": "a2d-05", "unit": "g2AddWithin100", "skill": "add_2digit",
  "format": "addTwoDigit", "difficulty": 3,
  "prompt": "64 + 29 = ?", "answer": "93", "supports": ["placeValueMat"],
  "payload": { "left": 64, "right": 29, "target": 93 } },

{ "id": "s2d-01", "unit": "g2SubWithin100", "skill": "sub_2digit",
  "format": "subTwoDigit", "difficulty": 1,
  "prompt": "45 - 21 = ?", "answer": "24", "supports": ["placeValueMat"],
  "payload": { "minuend": 45, "subtrahend": 21, "target": 24 } },
{ "id": "s2d-02", "unit": "g2SubWithin100", "skill": "sub_2digit",
  "format": "subTwoDigit", "difficulty": 1,
  "prompt": "67 - 34 = ?", "answer": "33", "supports": ["placeValueMat"],
  "payload": { "minuend": 67, "subtrahend": 34, "target": 33 } },
{ "id": "s2d-03", "unit": "g2SubWithin100", "skill": "sub_2digit",
  "format": "subTwoDigit", "difficulty": 2,
  "prompt": "72 - 45 = ?", "answer": "27", "supports": ["placeValueMat"],
  "payload": { "minuend": 72, "subtrahend": 45, "target": 27 } },
{ "id": "s2d-04", "unit": "g2SubWithin100", "skill": "sub_2digit",
  "format": "subTwoDigit", "difficulty": 2,
  "prompt": "83 - 56 = ?", "answer": "27", "supports": ["placeValueMat"],
  "payload": { "minuend": 83, "subtrahend": 56, "target": 27 } },
{ "id": "s2d-05", "unit": "g2SubWithin100", "skill": "sub_2digit",
  "format": "subTwoDigit", "difficulty": 3,
  "prompt": "91 - 47 = ?", "answer": "44", "supports": ["placeValueMat"],
  "payload": { "minuend": 91, "subtrahend": 47, "target": 44 } }
```

Rewards:

```json
{ "id": "reward-g2add", "title": "Place Value Pro",    "description": "Complete Add Within 100" },
{ "id": "reward-g2sub", "title": "Subtraction Master", "description": "Complete Subtract Within 100" }
```

**Step 3: Update `lesson-plans-k5.json` — mark new K lessons as playable**

Find the kindergarten entries and update them:

- `k-story-add-sub` → already `isPlayableInApp: true`, `linkedUnit: "subtractionStories"` ✓ (leave as-is)
- `k-teen-intro` → already `isPlayableInApp: true`, `linkedUnit: "teenPlaceValue"` ✓ (leave as-is)
- `k-count-objects-10` → change `"isPlayableInApp": false` to `true`, set `"linkedUnit": "kCountObjects"`
- `k-compose-decompose-10` → change to `true`, set `"linkedUnit": "kComposeDecompose"`
- `k-compare-groups` → leave `false` (no unit yet)
- `k-shape-attributes` → leave `false` (geometry not in scope)

Add new K lesson entries for addition (insert into kindergarten `"lessons"` array):

```json
{
  "id": "k-add-within-5",
  "grade": "kindergarten",
  "title": "Addition Within 5",
  "domain": "operationsAlgebraicThinking",
  "objective": "Add two groups with a total of 5 or less using objects and drawings.",
  "standards": ["CCSS.MATH.CONTENT.K.OA.A.1", "CCSS.MATH.CONTENT.K.OA.A.2"],
  "strategies": ["concretePictorialAbstract", "mathTalk", "guidedDiscovery"],
  "estimatedMinutes": 15,
  "isPlayableInApp": true,
  "linkedUnit": "kAddWithin5",
  "activityPrompt": "Use counters to act out addition stories and write the equation."
},
{
  "id": "k-add-within-10",
  "grade": "kindergarten",
  "title": "Addition Within 10",
  "domain": "operationsAlgebraicThinking",
  "objective": "Add two groups with a total of 10 or less using a ten frame.",
  "standards": ["CCSS.MATH.CONTENT.K.OA.A.2", "CCSS.MATH.CONTENT.K.OA.A.5"],
  "strategies": ["concretePictorialAbstract", "numberBonds", "spiralReview"],
  "estimatedMinutes": 18,
  "isPlayableInApp": true,
  "linkedUnit": "kAddWithin10",
  "activityPrompt": "Fill a ten frame and write the matching addition equation."
}
```

Add G1 and G2 lesson entries into their respective grade blocks:

For `grade1` block, add:

```json
{
  "id": "g1-add-within-20",
  "grade": "grade1",
  "title": "Addition Within 20",
  "domain": "operationsAlgebraicThinking",
  "objective": "Add fluently within 20 using strategies like make-ten.",
  "standards": ["CCSS.MATH.CONTENT.1.OA.A.1", "CCSS.MATH.CONTENT.1.OA.C.6"],
  "strategies": ["concretePictorialAbstract", "barModeling", "mathTalk"],
  "estimatedMinutes": 22,
  "isPlayableInApp": true,
  "linkedUnit": "g1AddWithin20",
  "activityPrompt": "Use a number line to add and record equations."
},
{
  "id": "g1-fact-families",
  "grade": "grade1",
  "title": "Fact Families",
  "domain": "operationsAlgebraicThinking",
  "objective": "Find the missing addend using part-part-whole relationships.",
  "standards": ["CCSS.MATH.CONTENT.1.OA.B.3", "CCSS.MATH.CONTENT.1.OA.D.8"],
  "strategies": ["numberBonds", "variationTheory", "errorAnalysis"],
  "estimatedMinutes": 20,
  "isPlayableInApp": true,
  "linkedUnit": "g1FactFamilies",
  "activityPrompt": "Complete number bond triangles and write all four related equations."
}
```

For `grade2` block, add:

```json
{
  "id": "g2-add-within-100",
  "grade": "grade2",
  "title": "Add Within 100",
  "domain": "numberOperationsBaseTen",
  "objective": "Add two-digit numbers using place value strategies.",
  "standards": ["CCSS.MATH.CONTENT.2.NBT.B.5", "CCSS.MATH.CONTENT.2.NBT.B.7"],
  "strategies": ["concretePictorialAbstract", "barModeling", "spiralReview"],
  "estimatedMinutes": 22,
  "isPlayableInApp": true,
  "linkedUnit": "g2AddWithin100",
  "activityPrompt": "Use base-ten blocks to add, then record the algorithm."
},
{
  "id": "g2-sub-within-100",
  "grade": "grade2",
  "title": "Subtract Within 100",
  "domain": "numberOperationsBaseTen",
  "objective": "Subtract two-digit numbers with and without regrouping.",
  "standards": ["CCSS.MATH.CONTENT.2.NBT.B.5", "CCSS.MATH.CONTENT.2.NBT.B.7"],
  "strategies": ["concretePictorialAbstract", "errorAnalysis", "spiralReview"],
  "estimatedMinutes": 24,
  "isPlayableInApp": true,
  "linkedUnit": "g2SubWithin100",
  "activityPrompt": "Model regrouping with blocks before moving to the written algorithm."
}
```

**Step 4: Run both new tests + full suite**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | tail -20
```

Expected: All pass.

**Step 5: Commit**

```bash
git add MathQuestKids/Content/content-pack-v1.json MathQuestKids/Content/lesson-plans-k5.json MathQuestKidsTests/MathQuestKidsTests.swift
git commit -m "feat: add G2 content and update lesson-plans-k5 for K-G2 coverage"
```

---

### Task 5: Add Addition Interaction Views in SessionView

**Files:**
- Modify: `MathQuestKids/Features/Session/SessionView.swift`

The `SessionView` has a switch on `ItemFormat` to render the question UI. It currently has no cases for `additionStory`, `countAndMatch`, `numberBond`, `factFamily`, `addTwoDigit`, `subTwoDigit`. The build will have placeholder stubs from Task 1 — replace them with real views now.

**Step 1: Read `SessionView.swift` fully before touching it**

```bash
# In Xcode: open MathQuestKids/Features/Session/SessionView.swift
# Or read it in your editor to understand the existing switch pattern
```

**Step 2: Implement each new format case**

The pattern for existing formats is: render a question prompt, show answer options as tap buttons, call the submission handler. Follow exactly the same structure.

For `additionStory`, `addTwoDigit`, `subTwoDigit`, `factFamily` — they all show a text prompt and 3–4 tappable numeric choices (options array from `PracticeItem`). Render identically to the existing `subtractionStory` case. The only difference is the prompt text already in the item.

```swift
case .additionStory, .addTwoDigit, .subTwoDigit, .factFamily:
    // Reuse subtraction story layout — prompt + answer choices
    // Copy the subtractionStory case body verbatim here
```

For `countAndMatch` — show dots equal to `payload.target` arranged in a grid, then 4 numeric choices. The dots can be rendered as a `LazyVGrid` of filled `Circle()` views sized 28pt:

```swift
case .countAndMatch:
    VStack(spacing: 16) {
        // Dot display
        let count = item.payload.target ?? 0
        LazyVGrid(columns: Array(repeating: GridItem(.fixed(36)), count: 5), spacing: 8) {
            ForEach(0..<count, id: \.self) { _ in
                Circle()
                    .fill(appState.selectedTheme.primary)
                    .frame(width: 28, height: 28)
            }
        }
        .padding()
        Text(item.prompt)
            .font(.title2.bold())
        // Answer choices — same as subtraction story
    }
```

For `numberBond` — show a number bond diagram: a circle for the whole (10), two circles below for parts, one of which is the missing value shown as "?":

```swift
case .numberBond:
    VStack(spacing: 20) {
        // Whole circle
        Circle()
            .fill(Color.white)
            .overlay(Circle().stroke(appState.selectedTheme.primary, lineWidth: 2))
            .overlay(Text("\(item.payload.target ?? 10)").font(.title.bold()))
            .frame(width: 72, height: 72)
        // Dividing line
        Rectangle().frame(height: 2).foregroundStyle(appState.selectedTheme.primary)
            .padding(.horizontal, 60)
        // Two part circles
        HStack(spacing: 60) {
            let leftLabel = item.payload.left.map { "\($0)" } ?? "?"
            let rightLabel = item.payload.right.map { "\($0)" } ?? "?"
            ForEach([leftLabel, rightLabel], id: \.self) { label in
                Circle()
                    .fill(label == "?" ? appState.selectedTheme.accent.opacity(0.2) : Color.white)
                    .overlay(Circle().stroke(appState.selectedTheme.primary, lineWidth: 2))
                    .overlay(Text(label).font(.title2.bold()))
                    .frame(width: 64, height: 64)
            }
        }
        // Answer choices
    }
```

**Step 3: Build and run all tests**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add MathQuestKids/Features/Session/SessionView.swift
git commit -m "feat: add session interaction views for addition, count, and number bond formats"
```

---

## PHASE 2 — Sticker Book & Reward Splash

---

### Task 6: Add CDStickerRecord to Core Data Model

**Files:**
- Modify: `MathQuestKids/Data/ManagedEntities.swift`
- Modify: Core Data model file (`.xcdatamodeld`) — open in Xcode's model editor to add the entity

**Step 1: Read `CoreDataStack.swift` to understand whether the model is file-based or programmatic**

```bash
# Open MathQuestKids/Data/CoreDataStack.swift in editor
```

If file-based (`.xcdatamodeld`): open the model editor in Xcode, add a new entity `CDStickerRecord` with attributes `unitRaw: String`, `dateEarned: Date`, `childID: UUID`.

If programmatic: follow the same pattern used for `CDAttempt` etc.

**Step 2: Add the class to `ManagedEntities.swift`**

```swift
@objc(CDStickerRecord)
final class CDStickerRecord: NSManagedObject {
    @NSManaged var childID: UUID
    @NSManaged var unitRaw: String
    @NSManaged var dateEarned: Date
}
```

**Step 3: Write a failing test**

```swift
@Test
func stickerRecordPersistsAndLoads() throws {
    let stack = CoreDataStack(inMemory: true)
    let repo = ProgressRepository(coreDataStack: stack)
    let profile = try repo.createOrLoadProfile(name: "Kid")

    try repo.saveStickerEarned(childID: profile.id, unitRaw: "kAddWithin5", dateEarned: .now)
    let stickers = repo.fetchStickers(childID: profile.id)
    #expect(stickers.count == 1)
    #expect(stickers.first?.unitRaw == "kAddWithin5")
}
```

**Step 4: Add `saveStickerEarned` and `fetchStickers` to `ProgressRepository`**

Open `MathQuestKids/Data/ProgressRepository.swift`. Add:

```swift
func saveStickerEarned(childID: UUID, unitRaw: String, dateEarned: Date) throws {
    let context = coreDataStack.viewContext
    // Avoid duplicates: check if sticker already exists
    let fetchRequest = NSFetchRequest<CDStickerRecord>(entityName: "CDStickerRecord")
    fetchRequest.predicate = NSPredicate(format: "childID == %@ AND unitRaw == %@",
                                         childID as CVarArg, unitRaw)
    let existing = try context.fetch(fetchRequest)
    guard existing.isEmpty else { return }

    let record = CDStickerRecord(context: context)
    record.childID = childID
    record.unitRaw = unitRaw
    record.dateEarned = dateEarned
    try context.save()
}

func fetchStickers(childID: UUID) -> [CDStickerRecord] {
    let request = NSFetchRequest<CDStickerRecord>(entityName: "CDStickerRecord")
    request.predicate = NSPredicate(format: "childID == %@", childID as CVarArg)
    request.sortDescriptors = [NSSortDescriptor(key: "dateEarned", ascending: true)]
    return (try? coreDataStack.viewContext.fetch(request)) ?? []
}
```

**Step 5: Run test to verify pass, then full suite**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | tail -20
```

**Step 6: Commit**

```bash
git add MathQuestKids/Data/ManagedEntities.swift MathQuestKids/Data/ProgressRepository.swift MathQuestKidsTests/MathQuestKidsTests.swift
git commit -m "feat: add CDStickerRecord persistence and ProgressRepository sticker methods"
```

---

### Task 7: Create StickerModels.swift

**Files:**
- Create: `MathQuestKids/Domain/StickerModels.swift`

**Step 1: Create the file**

```swift
import Foundation

struct Sticker: Identifiable, Equatable {
    let unitType: UnitType
    let dateEarned: Date?   // nil = locked

    var id: String { unitType.rawValue }
    var isUnlocked: Bool { dateEarned != nil }

    var assetName: String { "sticker-\(unitType.rawValue)" }

    var title: String { unitType.title + " Sticker" }
}

struct StickerCollection: Equatable {
    let stickers: [Sticker]

    static func build(from records: [CDStickerRecord]) -> StickerCollection {
        let earnedByUnit = Dictionary(
            uniqueKeysWithValues: records.map { ($0.unitRaw, $0.dateEarned) }
        )
        let stickers = UnitType.learningPath.map { unit in
            Sticker(unitType: unit, dateEarned: earnedByUnit[unit.rawValue])
        }
        return StickerCollection(stickers: stickers)
    }

    var earnedCount: Int { stickers.filter(\.isUnlocked).count }
    var totalCount: Int { stickers.count }
}
```

**Step 2: Write a test**

```swift
@Test
func stickerCollectionBuildsFromRecords() throws {
    let stack = CoreDataStack(inMemory: true)
    let repo = ProgressRepository(coreDataStack: stack)
    let profile = try repo.createOrLoadProfile(name: "Kid")
    try repo.saveStickerEarned(childID: profile.id, unitRaw: "kAddWithin5", dateEarned: .now)

    let records = repo.fetchStickers(childID: profile.id)
    let collection = StickerCollection.build(from: records)

    #expect(collection.earnedCount == 1)
    let sticker = collection.stickers.first(where: { $0.unitType == .kAddWithin5 })
    #expect(sticker?.isUnlocked == true)
}
```

**Step 3: Run full test suite**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add MathQuestKids/Domain/StickerModels.swift MathQuestKidsTests/MathQuestKidsTests.swift
git commit -m "feat: add StickerModels and StickerCollection"
```

---

### Task 8: Create RewardSplashView

**Files:**
- Create: `MathQuestKids/Features/Rewards/RewardSplashView.swift`

Create the `Rewards/` directory first:

```bash
mkdir -p "MathQuestKids/Features/Rewards"
```

**Step 1: Create the view**

```swift
import SwiftUI

struct RewardSplashView: View {
    let sticker: Sticker
    let onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @EnvironmentObject private var appState: AppState
    @State private var appeared = false
    @State private var showParticles = false

    var body: some View {
        ZStack {
            // Backdrop
            Color.black.opacity(0.55)
                .ignoresSafeArea()
                .onTapGesture { onDismiss() }

            VStack(spacing: 28) {
                Text("You earned a sticker!")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)

                // Sticker image (asset or SF Symbol fallback)
                Group {
                    if let image = UIImage(named: sticker.assetName) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                    } else {
                        Image(systemName: "star.circle.fill")
                            .resizable()
                            .scaledToFit()
                            .foregroundStyle(appState.selectedTheme.accent)
                    }
                }
                .frame(width: 180, height: 180)
                .scaleEffect(appeared ? 1.0 : (reduceMotion ? 0.95 : 0.2))
                .opacity(appeared ? 1.0 : 0.0)
                .animation(
                    reduceMotion
                        ? .easeIn(duration: 0.25)
                        : .spring(response: 0.5, dampingFraction: 0.65),
                    value: appeared
                )

                Text(sticker.title)
                    .font(.title2.bold())
                    .foregroundStyle(.white)

                Button("Awesome!") { onDismiss() }
                    .font(.title3.bold())
                    .padding(.horizontal, 32)
                    .padding(.vertical, 14)
                    .background(appState.selectedTheme.accent, in: Capsule())
                    .foregroundStyle(.white)
                    .accessibilityLabel("Dismiss sticker reward")
            }
            .padding(40)

            // Particle burst (reduced-motion off only)
            if showParticles && !reduceMotion {
                ParticleBurstView()
                    .allowsHitTesting(false)
            }
        }
        .onAppear {
            appeared = true
            if !reduceMotion {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    showParticles = true
                }
            }
            // Narrate
            appState.narrationService.speak("You earned the \(sticker.title)!")
        }
        .accessibilityAddTraits(.isModal)
    }
}

/// Simple confetti burst — 20 colored circles scatter from center
struct ParticleBurstView: View {
    @State private var animate = false
    private let particles: [(angle: Double, color: Color)] = (0..<20).map { i in
        (angle: Double(i) * 18.0,
         color: [Color.yellow, .pink, .mint, .orange, .purple][i % 5])
    }

    var body: some View {
        GeometryReader { geo in
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            ZStack {
                ForEach(0..<particles.count, id: \.self) { i in
                    let p = particles[i]
                    let radian = p.angle * .pi / 180
                    let distance: CGFloat = animate ? 180 : 0
                    Circle()
                        .fill(p.color)
                        .frame(width: 10, height: 10)
                        .position(
                            x: center.x + cos(radian) * distance,
                            y: center.y + sin(radian) * distance
                        )
                        .opacity(animate ? 0 : 1)
                }
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.7)) {
                animate = true
            }
        }
    }
}
```

**Step 2: Build to verify no compile errors**

```bash
xcodebuild build -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | grep -E "error:" | head -20
```

**Step 3: Commit**

```bash
git add MathQuestKids/Features/Rewards/
git commit -m "feat: add RewardSplashView with sticker reveal and particle burst"
```

---

### Task 9: Trigger Reward Splash from SessionSummaryView

**Files:**
- Modify: `MathQuestKids/Features/Session/SessionSummaryView.swift`
- Modify: `MathQuestKids/App/AppState.swift`

**Step 1: Add sticker state to AppState**

In `AppState.swift`, add two published properties after the existing `@Published` block:

```swift
@Published var pendingStickerReward: Sticker? = nil
@Published var stickerCollection: StickerCollection = StickerCollection(stickers: [])
```

Add a method:

```swift
func checkAndAwardSticker(for unit: UnitType) {
    guard let profile else { return }
    // A "pack complete" means the session was the last one needed — use sessionCount >= 3 as threshold
    let progress = dashboard.unitProgress.first(where: { $0.unit == unit })
    guard let progress, progress.completedSessions >= 1 else { return }
    // Award sticker if not already earned
    let already = stickerCollection.stickers.first(where: { $0.unitType == unit })
    guard already?.isUnlocked != true else { return }
    try? repository.saveStickerEarned(childID: profile.id, unitRaw: unit.rawValue, dateEarned: .now)
    refreshStickerCollection()
    let sticker = Sticker(unitType: unit, dateEarned: .now)
    pendingStickerReward = sticker
}

func refreshStickerCollection() {
    guard let profile else { return }
    let records = repository.fetchStickers(childID: profile.id)
    stickerCollection = StickerCollection.build(from: records)
}
```

Call `refreshStickerCollection()` inside the existing `loadDashboard()` method (or wherever the dashboard snapshot is built on launch).

**Step 2: Call `checkAndAwardSticker` after a session finishes**

Find where `AppState` transitions to `.summary` route (likely in `completeSession()` or similar). After the existing session finish logic, add:

```swift
checkAndAwardSticker(for: completedUnit)
```

**Step 3: Update `SessionSummaryView` to show the splash overlay**

```swift
// Add to SessionSummaryView body, wrapping existing content:
ZStack {
    // existing VStack content here (unchanged)
    VStack { ... }

    // Sticker splash overlay
    if let sticker = appState.pendingStickerReward {
        RewardSplashView(sticker: sticker) {
            appState.pendingStickerReward = nil
        }
        .transition(.opacity)
        .zIndex(10)
    }
}
.animation(.easeInOut(duration: 0.2), value: appState.pendingStickerReward != nil)
```

**Step 4: Build and run all tests**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | tail -20
```

**Step 5: Commit**

```bash
git add MathQuestKids/App/AppState.swift MathQuestKids/Features/Session/SessionSummaryView.swift
git commit -m "feat: trigger sticker reward splash on pack completion"
```

---

### Task 10: Create StickerBookView

**Files:**
- Create: `MathQuestKids/Features/Rewards/StickerBookView.swift`

```swift
import SwiftUI

struct StickerBookView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    private let columns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("\(appState.stickerCollection.earnedCount) of \(appState.stickerCollection.totalCount) stickers earned")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.textSecondary)
                        .padding(.horizontal, 20)

                    LazyVGrid(columns: columns, spacing: 16) {
                        ForEach(appState.stickerCollection.stickers) { sticker in
                            StickerSlotView(sticker: sticker) {
                                if !sticker.isUnlocked {
                                    // Navigate to that unit
                                    appState.startSession(for: sticker.unitType)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                }
                .padding(.top, 16)
                .padding(.bottom, 32)
            }
            .navigationTitle("Sticker Book")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
    }
}

struct StickerSlotView: View {
    let sticker: Sticker
    let onTap: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var showDate = false

    var body: some View {
        Button(action: {
            if sticker.isUnlocked { showDate.toggle() } else { onTap() }
        }) {
            VStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(sticker.isUnlocked
                            ? appState.selectedTheme.accent.opacity(0.15)
                            : Color.gray.opacity(0.12))
                        .frame(width: 100, height: 100)

                    Group {
                        if sticker.isUnlocked {
                            if let img = UIImage(named: sticker.assetName) {
                                Image(uiImage: img).resizable().scaledToFit()
                            } else {
                                Image(systemName: "star.circle.fill")
                                    .font(.system(size: 52))
                                    .foregroundStyle(appState.selectedTheme.accent)
                            }
                        } else {
                            VStack(spacing: 4) {
                                Image(systemName: "lock.fill")
                                    .font(.system(size: 28))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .frame(width: 80, height: 80)
                    .grayscale(sticker.isUnlocked ? 0 : 1)
                }

                Text(sticker.unitType.title)
                    .font(.caption.bold())
                    .foregroundStyle(sticker.isUnlocked ? AppTheme.textPrimary : .secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .frame(width: 100)

                if showDate, let date = sticker.dateEarned {
                    Text(date.formatted(date: .abbreviated, time: .omitted))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(sticker.isUnlocked
            ? "\(sticker.title) earned"
            : "Locked. Complete \(sticker.unitType.title) to unlock.")
        .opacity(sticker.isUnlocked ? 1 : 0.7)
    }
}
```

**Step 2: Add Sticker Book route and button to AppState + HomeView**

In `AppState.Route`, add `.stickerBook`:

```swift
case stickerBook
```

In `AppState`, add:

```swift
func openStickerBook() {
    route = .stickerBook
}
```

In `HomeView.swift`, add a "Sticker Book" button inside the `rewardCard` section (or as a new card), after the existing streak progress view:

```swift
Button("Open Sticker Book") {
    appState.openStickerBook()
}
.buttonStyle(SecondaryButtonStyle())
.accessibilityLabel("Open Sticker Book")
```

In `RootView.swift` (or wherever routes are handled), add the `.stickerBook` case:

```swift
case .stickerBook:
    StickerBookView()
        .environmentObject(appState)
```

**Step 3: Build and run all tests**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add MathQuestKids/Features/Rewards/StickerBookView.swift \
        MathQuestKids/App/AppState.swift \
        MathQuestKids/Features/Home/HomeView.swift \
        MathQuestKids/App/RootView.swift
git commit -m "feat: add StickerBookView and Sticker Book route"
```

---

## PHASE 3 — Child-Facing Skill Trail

---

### Task 11: Create SkillTrailModels

**Files:**
- Create: `MathQuestKids/Domain/SkillTrailModels.swift`

```swift
import Foundation

enum NodeState: Equatable {
    case locked
    case available
    case inProgress(masteryPercent: Double)
    case completed
    case mastered
}

struct TrailNode: Identifiable, Equatable {
    let unit: UnitType
    let nodeState: NodeState
    let isRecommended: Bool   // highlighted by AdaptiveLessonPlanner
    let stickerEarned: Bool

    var id: String { unit.rawValue }
}

struct SkillTrail: Equatable {
    let nodes: [TrailNode]

    /// Build from live app state
    static func build(
        dashboard: DashboardSnapshot,
        adaptivePath: AdaptiveLessonPath,
        stickerCollection: StickerCollection
    ) -> SkillTrail {
        let recommendedUnits = Set(
            adaptivePath.recommendedLessons.compactMap { lesson -> UnitType? in
                guard let raw = lesson.linkedUnit else { return nil }
                return UnitType(rawValue: raw)
            }
        )

        var previousUnlocked = true
        let nodes: [TrailNode] = UnitType.learningPath.map { unit in
            let progress = dashboard.unitProgress.first(where: { $0.unit == unit })
            let sessions = progress?.completedSessions ?? 0
            let unlocked = progress?.unlocked ?? false
            let stickerEarned = stickerCollection.stickers.first(where: { $0.unitType == unit })?.isUnlocked ?? false

            let state: NodeState
            if !unlocked && !previousUnlocked {
                state = .locked
            } else if sessions == 0 && unlocked {
                state = .available
            } else if sessions >= 3 {
                // Treat 3+ sessions as mastered (tune threshold as needed)
                state = .mastered
            } else if sessions >= 1 {
                state = .completed
            } else {
                state = .inProgress(masteryPercent: Double(sessions) / 3.0)
            }

            previousUnlocked = unlocked
            return TrailNode(
                unit: unit,
                nodeState: state,
                isRecommended: recommendedUnits.contains(unit),
                stickerEarned: stickerEarned
            )
        }

        return SkillTrail(nodes: nodes)
    }
}
```

**Step 2: Write a test**

```swift
@Test
func skillTrailBuildsCorrectNodeStates() {
    let progress = UnitType.learningPath.enumerated().map { i, unit in
        UnitProgress(unit: unit, completedSessions: i == 0 ? 2 : 0, unlocked: i <= 1)
    }
    let dashboard = DashboardSnapshot(
        completedSessions: 2, averageAccuracy: 0.9, streakDays: 3,
        unitProgress: progress
    )
    let trail = SkillTrail.build(
        dashboard: dashboard,
        adaptivePath: .empty,
        stickerCollection: StickerCollection(stickers: [])
    )
    #expect(trail.nodes.first?.nodeState == .completed)
    #expect(trail.nodes[1].nodeState == .available)
}
```

**Step 3: Run tests**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add MathQuestKids/Domain/SkillTrailModels.swift MathQuestKidsTests/MathQuestKidsTests.swift
git commit -m "feat: add SkillTrailModels with NodeState and SkillTrail builder"
```

---

### Task 12: Create SkillTrailView and Replace Home Unit Grid

**Files:**
- Create: `MathQuestKids/Features/Home/SkillTrailView.swift`
- Modify: `MathQuestKids/Features/Home/HomeView.swift`

**Step 1: Create `SkillTrailView.swift`**

```swift
import SwiftUI

struct SkillTrailView: View {
    @EnvironmentObject private var appState: AppState
    let trail: SkillTrail

    // Group nodes by grade band for section headers
    private var gradeGroups: [(grade: String, nodes: [TrailNode])] {
        let kUnits: Set<UnitType> = [.kCountObjects, .kComposeDecompose, .kAddWithin5, .kAddWithin10,
                                      .subtractionStories, .teenPlaceValue]
        let g1Units: Set<UnitType> = [.g1AddWithin20, .g1FactFamilies, .twoDigitComparison]
        let g2Units: Set<UnitType> = [.g2AddWithin100, .g2SubWithin100, .threeDigitComparison]
        let g3Units: Set<UnitType> = [.multiplicationArrays]
        let g45Units: Set<UnitType> = [.fractionComparison, .fractionOfWhole, .volumeAndDecimals]

        return [
            ("Kindergarten", trail.nodes.filter { kUnits.contains($0.unit) }),
            ("Grade 1", trail.nodes.filter { g1Units.contains($0.unit) }),
            ("Grade 2", trail.nodes.filter { g2Units.contains($0.unit) }),
            ("Grade 3", trail.nodes.filter { g3Units.contains($0.unit) }),
            ("Grades 4–5", trail.nodes.filter { g45Units.contains($0.unit) }),
        ].filter { !$0.1.isEmpty }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Skill Trail")
                .font(.title2.bold())
                .foregroundStyle(AppTheme.textPrimary)
                .padding(.bottom, 12)

            ForEach(gradeGroups, id: \.grade) { group in
                VStack(alignment: .leading, spacing: 8) {
                    // Grade milestone header
                    HStack(spacing: 6) {
                        Text(group.grade)
                            .font(.caption.bold())
                            .foregroundStyle(appState.selectedTheme.primary)
                        Image(systemName: "star.fill")
                            .font(.caption2)
                            .foregroundStyle(appState.selectedTheme.accent)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(appState.selectedTheme.primary.opacity(0.10),
                                in: Capsule())
                    .padding(.bottom, 4)

                    // Scrollable horizontal row of nodes
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 14) {
                            ForEach(group.nodes) { node in
                                SkillTrailNodeView(node: node) {
                                    appState.startSession(for: node.unit)
                                }
                            }
                        }
                        .padding(.horizontal, 4)
                        .padding(.vertical, 4)
                    }
                }
                .padding(.bottom, 16)
            }
        }
        .padding(18)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22)
            .stroke(appState.selectedTheme.primary.opacity(0.14), lineWidth: 1))
        .shadow(color: .black.opacity(0.10), radius: 12, x: 0, y: 6)
    }
}

struct SkillTrailNodeView: View {
    @EnvironmentObject private var appState: AppState
    let node: TrailNode
    let onTap: () -> Void

    private var nodeColor: Color {
        switch node.nodeState {
        case .locked:           return Color.gray.opacity(0.35)
        case .available:        return appState.selectedTheme.primary.opacity(0.75)
        case .inProgress:       return appState.selectedTheme.primary
        case .completed:        return appState.selectedTheme.accent
        case .mastered:         return Color.yellow
        }
    }

    private var nodeSymbol: String {
        switch node.nodeState {
        case .locked:           return "lock.fill"
        case .available:        return "play.fill"
        case .inProgress:       return "pencil"
        case .completed:        return "checkmark"
        case .mastered:         return "star.fill"
        }
    }

    var body: some View {
        Button(action: {
            guard node.nodeState != .locked else { return }
            onTap()
        }) {
            VStack(spacing: 6) {
                ZStack {
                    Circle()
                        .fill(nodeColor)
                        .frame(width: 64, height: 64)

                    if node.isRecommended && node.nodeState != .locked {
                        Circle()
                            .stroke(Color.white, lineWidth: 3)
                            .frame(width: 70, height: 70)
                    }

                    Image(systemName: nodeSymbol)
                        .font(.title3.bold())
                        .foregroundStyle(.white)

                    // Mastery fill ring for inProgress
                    if case .inProgress(let pct) = node.nodeState {
                        Circle()
                            .trim(from: 0, to: pct)
                            .stroke(Color.white.opacity(0.8), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                            .frame(width: 58, height: 58)
                            .rotationEffect(.degrees(-90))
                    }

                    // Sticker thumbnail in corner
                    if node.stickerEarned {
                        VStack {
                            HStack {
                                Spacer()
                                Image(systemName: "star.circle.fill")
                                    .font(.caption.bold())
                                    .foregroundStyle(.yellow)
                                    .background(Circle().fill(.white).padding(-2))
                            }
                            Spacer()
                        }
                        .frame(width: 64, height: 64)
                    }
                }

                Text(node.unit.title)
                    .font(.caption2.bold())
                    .foregroundStyle(node.nodeState == .locked ? .secondary : AppTheme.textPrimary)
                    .multilineTextAlignment(.center)
                    .frame(width: 72)
                    .lineLimit(2)
            }
        }
        .buttonStyle(.plain)
        .opacity(node.nodeState == .locked ? 0.5 : 1.0)
        .accessibilityLabel("\(node.unit.title): \(accessibilityStateLabel)")
    }

    private var accessibilityStateLabel: String {
        switch node.nodeState {
        case .locked: return "Locked"
        case .available: return "Available, tap to start"
        case .inProgress(let p): return "In progress, \(Int(p * 100)) percent"
        case .completed: return "Completed"
        case .mastered: return "Mastered"
        }
    }
}
```

**Step 2: Update `HomeView.swift` — replace `unitGrid` with `SkillTrailView`**

In `HomeView.body`, find:

```swift
Text("Math Worlds")
    .font(.title2.bold())
    .foregroundStyle(AppTheme.textPrimary)
unitGrid
```

Replace with:

```swift
SkillTrailView(trail: appState.skillTrail)
    .environmentObject(appState)
```

Add a computed property `skillTrail` to `AppState`:

```swift
var skillTrail: SkillTrail {
    SkillTrail.build(
        dashboard: dashboard,
        adaptivePath: adaptivePath,
        stickerCollection: stickerCollection
    )
}
```

**Step 3: Remove the now-unused `unitGrid` and `UnitCardView` if only used in HomeView. If `UnitCardView` is used elsewhere, keep it.**

**Step 4: Build and run tests**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | tail -20
```

**Step 5: Commit**

```bash
git add MathQuestKids/Features/Home/SkillTrailView.swift \
        MathQuestKids/Features/Home/HomeView.swift \
        MathQuestKids/App/AppState.swift
git commit -m "feat: add SkillTrailView and replace Home unit grid with skill trail"
```

---

## PHASE 4 — Parent Dashboard

---

### Task 13: Create ProgressReportModels and ProgressReportService

**Files:**
- Create: `MathQuestKids/Domain/ProgressReportModels.swift`
- Create: `MathQuestKids/Services/ProgressReportService.swift`

**Step 1: Create `ProgressReportModels.swift`**

```swift
import Foundation

struct DomainReport: Identifiable, Equatable {
    let domain: MathDomain
    let skillsCovered: Int
    let skillsTotal: Int
    let averageAccuracy: Double  // 0.0–1.0
    let perSkillStatus: [SkillStatus]

    var id: String { domain.rawValue }
    var coverageFraction: Double {
        skillsTotal > 0 ? Double(skillsCovered) / Double(skillsTotal) : 0
    }
    var isWeakSpot: Bool { averageAccuracy < 0.40 && skillsCovered > 0 }
}

struct SkillStatus: Identifiable, Equatable {
    let skillID: String
    let title: String
    let masteryStatus: MasteryStatus  // reuse existing enum
    var id: String { skillID }
}

struct WeeklyActivity: Identifiable, Equatable {
    let date: Date
    let unitTitle: String
    let correctItems: Int
    let totalItems: Int
    var id: String { date.ISO8601Format() + unitTitle }
}

struct ProgressReport: Equatable {
    let childName: String
    let gradePlacement: String
    let streakDays: Int
    let lastActiveDate: Date?
    let domainReports: [DomainReport]
    let recentActivity: [WeeklyActivity]   // last 7 sessions
    let weakSpots: [DomainReport]          // isWeakSpot == true

    static let empty = ProgressReport(
        childName: "—", gradePlacement: "—", streakDays: 0,
        lastActiveDate: nil, domainReports: [], recentActivity: [], weakSpots: []
    )
}

// Reuse MathDomain from CurriculumModels (already defined as MathDomain / domain enum)
// If it's named differently, alias it here:
typealias MathDomain = MathContentDomain  // adjust to match actual type name in CurriculumModels.swift
```

> **Note:** Check `MathQuestKids/Domain/CurriculumModels.swift` for the exact domain enum type name and adjust the `typealias` accordingly.

**Step 2: Create `ProgressReportService.swift`**

```swift
import Foundation

final class ProgressReportService {
    private let repository: ProgressRepository
    private let catalog: CurriculumCatalog

    init(repository: ProgressRepository, catalog: CurriculumCatalog) {
        self.repository = repository
        self.catalog = catalog
    }

    func buildReport(for profile: ChildProfileRecord, dashboard: DashboardSnapshot, placedGrade: GradeBand) -> ProgressReport {
        let gradeLessons = catalog.lessons(for: placedGrade)
        let domainReports = buildDomainReports(childID: profile.id, lessons: gradeLessons)
        let recentActivity = buildRecentActivity(childID: profile.id)

        return ProgressReport(
            childName: profile.displayName,
            gradePlacement: placedGrade.title,
            streakDays: dashboard.streakDays,
            lastActiveDate: recentActivity.first?.date,
            domainReports: domainReports,
            recentActivity: recentActivity,
            weakSpots: domainReports.filter(\.isWeakSpot)
        )
    }

    private func buildDomainReports(childID: UUID, lessons: [LessonPlanItem]) -> [DomainReport] {
        let grouped = Dictionary(grouping: lessons, by: \.domain)
        return grouped.map { domain, domainLessons -> DomainReport in
            let playable = domainLessons.filter(\.isPlayableInApp)
            var coveredCount = 0
            var totalAccuracy = 0.0
            var perSkillStatus: [SkillStatus] = []

            for lesson in playable {
                guard let unitRaw = lesson.linkedUnit?.rawValue else { continue }
                let attempts = repository.recentAttemptsForUnit(childID: childID, unitRaw: unitRaw, limit: 20)
                let correct = attempts.filter(\.correct).count
                let accuracy = attempts.isEmpty ? 0.0 : Double(correct) / Double(attempts.count)

                if !attempts.isEmpty { coveredCount += 1 }
                totalAccuracy += accuracy

                let masteryRecord = repository.fetchMasteryState(childID: childID, skillID: lesson.id)
                let status = masteryRecord.map { MasteryStatus(rawValue: $0.statusRaw) ?? .learning } ?? .learning

                perSkillStatus.append(SkillStatus(skillID: lesson.id, title: lesson.title, masteryStatus: status))
            }

            let avgAccuracy = playable.isEmpty ? 0.0 : totalAccuracy / Double(playable.count)
            return DomainReport(
                domain: domain,
                skillsCovered: coveredCount,
                skillsTotal: playable.count,
                averageAccuracy: avgAccuracy,
                perSkillStatus: perSkillStatus
            )
        }
        .sorted(by: { $0.domain.rawValue < $1.domain.rawValue })
    }

    private func buildRecentActivity(childID: UUID) -> [WeeklyActivity] {
        let logs = repository.fetchRecentSessionLogs(childID: childID, limit: 7)
        return logs.map { log in
            WeeklyActivity(
                date: log.startedAt,
                unitTitle: UnitType(rawValue: log.unitRaw)?.title ?? log.unitRaw,
                correctItems: Int(log.correctItems),
                totalItems: Int(log.totalItems)
            )
        }
    }
}
```

> **Note:** This requires two new `ProgressRepository` methods: `recentAttemptsForUnit(childID:unitRaw:limit:)` and `fetchRecentSessionLogs(childID:limit:)`. Add them to `ProgressRepository.swift` following the same Core Data fetch pattern used in existing methods.

**Step 3: Write a test**

```swift
@Test
func progressReportServiceBuildsReport() throws {
    let stack = CoreDataStack(inMemory: true)
    let repo = ProgressRepository(coreDataStack: stack)
    let profile = try repo.createOrLoadProfile(name: "Kid")
    let catalog = try CurriculumService.loadDefaultCatalog()

    let service = ProgressReportService(repository: repo, catalog: catalog)
    let report = service.buildReport(
        for: profile,
        dashboard: .empty,
        placedGrade: .kindergarten
    )

    #expect(report.childName == "Kid")
    #expect(report.domainReports.isEmpty == false)
}
```

**Step 4: Run tests**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | tail -20
```

**Step 5: Commit**

```bash
git add MathQuestKids/Domain/ProgressReportModels.swift \
        MathQuestKids/Services/ProgressReportService.swift \
        MathQuestKids/Data/ProgressRepository.swift \
        MathQuestKidsTests/MathQuestKidsTests.swift
git commit -m "feat: add ProgressReportModels and ProgressReportService"
```

---

### Task 14: Create ParentDashboardView and Wire Into Settings

**Files:**
- Create: `MathQuestKids/Features/Settings/DomainCoverageCard.swift`
- Create: `MathQuestKids/Features/Settings/ParentDashboardView.swift`
- Modify: `MathQuestKids/Features/Settings/SettingsView.swift`
- Modify: `MathQuestKids/App/AppState.swift`

**Step 1: Create `DomainCoverageCard.swift`**

```swift
import SwiftUI

struct DomainCoverageCard: View {
    let report: DomainReport
    @State private var expanded = false
    @EnvironmentObject private var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button(action: { expanded.toggle() }) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(report.domain.title)
                            .font(.subheadline.bold())
                            .foregroundStyle(AppTheme.textPrimary)
                        Text("\(report.skillsCovered) of \(report.skillsTotal) skills")
                            .font(.caption)
                            .foregroundStyle(AppTheme.textSecondary)
                    }
                    Spacer()
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.gray.opacity(0.18))
                        .frame(height: 8)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(report.isWeakSpot
                              ? Color.orange
                              : appState.selectedTheme.primary)
                        .frame(width: geo.size.width * report.coverageFraction, height: 8)
                }
            }
            .frame(height: 8)

            if report.isWeakSpot {
                Label("Needs more practice", systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.bold())
                    .foregroundStyle(.orange)
            }

            if expanded {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(report.perSkillStatus) { skill in
                        HStack {
                            Image(systemName: statusSymbol(skill.masteryStatus))
                                .foregroundStyle(statusColor(skill.masteryStatus))
                                .frame(width: 18)
                            Text(skill.title)
                                .font(.caption)
                                .foregroundStyle(AppTheme.textPrimary)
                            Spacer()
                            Text(skill.masteryStatus.rawValue.capitalized)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(14)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16)
            .stroke(report.isWeakSpot ? Color.orange.opacity(0.5) : Color.gray.opacity(0.14), lineWidth: 1))
        .animation(.easeInOut(duration: 0.2), value: expanded)
    }

    private func statusSymbol(_ status: MasteryStatus) -> String {
        switch status {
        case .mastered: return "checkmark.circle.fill"
        case .practicing: return "circle.dotted"
        case .learning: return "circle"
        case .reviewDue: return "arrow.clockwise.circle"
        }
    }

    private func statusColor(_ status: MasteryStatus) -> Color {
        switch status {
        case .mastered: return .green
        case .practicing: return appState.selectedTheme.primary
        case .learning: return .secondary
        case .reviewDue: return .orange
        }
    }
}
```

**Step 2: Create `ParentDashboardView.swift`**

```swift
import SwiftUI

struct ParentDashboardView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    private var report: ProgressReport {
        appState.progressReport
    }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    VStack(alignment: .leading, spacing: 6) {
                        Text(report.childName)
                            .font(.title.bold())
                        Text("Grade placement: \(report.gradePlacement)")
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.textSecondary)
                        HStack(spacing: 16) {
                            Label("\(report.streakDays) day streak", systemImage: "flame.fill")
                            if let last = report.lastActiveDate {
                                Label("Last active \(last.formatted(date: .abbreviated, time: .omitted))",
                                      systemImage: "calendar")
                            }
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.textSecondary)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))

                    // Weak spots
                    if !report.weakSpots.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Needs more practice", systemImage: "exclamationmark.triangle.fill")
                                .font(.subheadline.bold())
                                .foregroundStyle(.orange)
                            ForEach(report.weakSpots) { domain in
                                DomainCoverageCard(report: domain)
                            }
                        }
                    }

                    // Domain coverage
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Skills by Domain")
                            .font(.headline)
                        ForEach(report.domainReports) { domain in
                            DomainCoverageCard(report: domain)
                        }
                    }

                    // Recent activity
                    if !report.recentActivity.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Recent Sessions")
                                .font(.headline)
                            ForEach(report.recentActivity) { activity in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(activity.unitTitle)
                                            .font(.subheadline.bold())
                                        Text(activity.date.formatted(date: .abbreviated, time: .omitted))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text("\(activity.correctItems)/\(activity.totalItems) correct")
                                        .font(.caption.bold())
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 5)
                                        .background(Color.green.opacity(0.15), in: Capsule())
                                }
                                .padding(10)
                                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }

                    // Standards note
                    Text("Curriculum aligned to Washington State K–2 Math Learning Standards (CCSS-based)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                }
                .padding(20)
            }
            .navigationTitle("Progress Report")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
    }
}
```

**Step 3: Add `progressReport` to AppState**

Add `ProgressReportService` as a property and a computed `progressReport`:

```swift
let progressReportService: ProgressReportService

// In init, after existing service setup:
self.progressReportService = ProgressReportService(
    repository: self.repository,
    catalog: curriculumCatalog
)

// Computed property:
var progressReport: ProgressReport {
    guard let profile else { return .empty }
    return progressReportService.buildReport(
        for: profile,
        dashboard: dashboard,
        placedGrade: adaptivePath.placedGrade
    )
}
```

**Step 4: Add "Progress Report" button to `SettingsView.swift`**

Find the parent gate section in `SettingsView`. After the gate is passed, add:

```swift
Button("View Progress Report") {
    appState.showParentDashboard = true
}
.buttonStyle(SecondaryButtonStyle())
.accessibilityLabel("View child progress report")
.sheet(isPresented: $appState.showParentDashboard) {
    ParentDashboardView()
        .environmentObject(appState)
}
```

Add `@Published var showParentDashboard = false` to `AppState`.

**Step 5: Build and run all tests**

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | tail -20
```

Expected: All pass.

**Step 6: Commit**

```bash
git add MathQuestKids/Features/Settings/DomainCoverageCard.swift \
        MathQuestKids/Features/Settings/ParentDashboardView.swift \
        MathQuestKids/Features/Settings/SettingsView.swift \
        MathQuestKids/App/AppState.swift
git commit -m "feat: add ParentDashboardView with domain coverage and recent activity"
```

---

## Final Verification

Run the full test suite one last time:

```bash
xcodebuild test -scheme MathQuestKids \
  -destination 'platform=iOS Simulator,name=iPad (10th generation)' \
  2>&1 | grep -E "Test Suite|PASSED|FAILED|error:" | head -30
```

Then manually verify in simulator:
1. Start a session on kAddWithin5 — answer all items — confirm reward splash fires with sticker
2. Open Sticker Book — confirm sticker shows unlocked, others locked
3. Return to Home — confirm Skill Trail shows kAddWithin5 as completed
4. Go to Settings → parent gate → Progress Report — confirm domain cards and recent session appear
5. Verify reduced-motion: Settings > Accessibility > Reduce Motion ON → reward splash fades instead of springs, no confetti

---

## Definition of Done

- [ ] All existing tests still pass
- [ ] All 8 new K-G2 units appear in content pack and are playable
- [ ] Sticker unlocks persist across app restarts (kill + relaunch)
- [ ] Reward splash fires exactly once per unit completion
- [ ] Skill trail reflects live mastery state
- [ ] Parent dashboard accessible only behind parent gate
- [ ] Reduced-motion respected in RewardSplashView
- [ ] All new interactive elements have `accessibilityLabel`
- [ ] WA/CCSS standard IDs verified: K.OA.A.1, K.OA.A.2, K.OA.A.3, K.OA.A.5, K.CC.B.4, K.CC.B.5, 1.OA.A.1, 1.OA.B.3, 1.OA.C.6, 1.OA.D.8, 2.NBT.B.5, 2.NBT.B.7
