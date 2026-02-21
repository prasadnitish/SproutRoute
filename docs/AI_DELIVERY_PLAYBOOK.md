# AI Delivery Playbook — SproutRoute

**Version:** 1.0 · **Created:** 2026-02-21 · **Owner:** Nitish Prasad

This document defines the operating model for using Claude Code to build SproutRoute. All development follows these rules.

---

## Core Principle

> **AI builds, humans approve. Automated tests verify. Nothing ships without green gates.**

Claude Code does the heavy lifting: researching code, writing implementations, writing tests, running commands. The human (Nitish) reviews architecture decisions and all user-facing safety/legal text. No exceptions.

---

## The Four Phases of Every Feature

### Phase A — Plan (read-only exploration)

Start every Claude Code session in plan mode to explore before touching code.

```bash
# In VS Code terminal or Claude Code:
# Use Shift+Tab to toggle to plan mode
# Or launch with: claude --permission-mode plan
```

Claude will:
- Read relevant source files and trace data flows
- Identify exactly which files and lines need changing
- Write an implementation plan with test strategy
- Flag any architectural concerns

**You review and approve** before any code is written. Request changes if the plan is off.

---

### Phase B — Build (iterative TDD)

After plan approval, switch to normal mode (Shift+Tab twice).

```
"Implement the plan using TDD. Write the failing test first,
 show me the failing output, then implement to make it pass."
```

Claude will:
- Write the test first (Red phase)
- Show failing output before implementing
- Implement minimum code to pass (Green phase)
- Refactor (Refactor phase)
- Repeat for each edge case

**After every logical chunk:** `"Run npm test"` — do not batch this to the end.

If tests fail: `"Fix the failing tests before continuing."`

---

### Phase C — Verify (before finishing)

```
"Run the full test suite and fix any failures.
 Then run the frontend build.
 Don't stop until both are green."
```

The **Stop hook** in `.claude/settings.json` automatically re-runs `npm test` when Claude tries to end the session. Claude cannot complete if tests are failing.

---

### Phase D — Deploy

```
"Create a commit with the changes, push to the feature branch,
 then check Railway logs for startup errors."
```

Claude will:
- Stage specific files (never `git add -A`)
- Commit with descriptive message
- Push to `feature/*` branch (never directly to `main`)
- Watch Railway build logs
- Watch Railway runtime logs for startup errors

You then review the PR and merge to `main` when ready.

---

## Mandatory Quality Gates

Every feature must pass ALL of these before merge:

| Gate | Command | Enforced by |
|------|---------|-------------|
| Backend tests | `npm test` | Stop hook + CI |
| Frontend build | `cd src/frontend && npm run build` | CI |
| API contract tests | `node --test tests/integration/apiV1.contract.test.js` | CI (Phase 1+) |
| Mobile type check | `cd sproutroute-mobile && npx tsc --noEmit` | CI (Phase 3+) |
| ESLint | `npm run lint --if-present` | CI |
| No secrets in diff | `git diff --cached \| grep sk-ant` | Manual check |

Human review required for:
- Architecture-sensitive changes (new service files, data flow changes)
- All user-visible safety/legal text (car seat, international disclaimers)
- Privacy policy updates
- Feature flags affecting non-US behavior

---

## Two-Agent Review Pattern

For significant features (API changes, new services, safety-related code), use the two-agent pattern:

**Agent 1 — Builder:** Implements the feature with tests.

**Agent 2 — Reviewer:** After Builder is done, start a new Claude Code session:
```
"Review the changes in the current branch vs main.
 Look for: regressions, security issues, contract drift, missing error handling,
 any user-facing text that exposes developer jargon.
 Do not modify code — report findings as a list."
```

You review the Reviewer's findings, then approve or request fixes.

---

## Context Management (Long Sessions)

As sessions grow, context fills. Use these commands:

```bash
/compact focus on [current feature name]
# Retains feature context, drops unrelated history

/context
# Shows context window fullness (color grid)

/resume [session-name]
# Resume a previous session with full history
```

For multi-file exploration without filling main context:
```
"Use an Explore subagent to find all files that reference [topic].
 Report back the file paths and relevant line numbers."
```

---

## Branch + PR Workflow

```
main (always deployable)
  └── feature/phase1-api-v1     ← all development
  └── feature/phase2-ux-fixes
  └── hotfix/car-seat-il-fix    ← urgent production fixes
```

**Workflow:**
1. Claude creates feature branch at session start
2. Builds + tests on feature branch
3. Claude pushes and opens PR
4. GitHub Actions runs CI (tests + build)
5. Human reviews architecture-sensitive PRs
6. Merge to `main` → Railway auto-deploys

**Rule:** Never push directly to `main` during active development.

---

## Session Logging

After every non-trivial session, append a log entry:

**Location:** `docs/ai-change-log/YYYY-MM-DD.md`

**Format:**
```markdown
## Session: [Feature Name] — [Time]

### What was built
[1-3 sentences]

### Files modified
- `src/backend/services/weather.js` — [what changed]
- `tests/unit/weather.test.js` — [new tests added]

### Tests added
- [test description] in [file]

### Architecture decisions
- [decision] because [reason]

### Prompt patterns that worked well
- [prompt that got good results]
```

This creates portfolio evidence of a rigorous AI-assisted engineering process.

---

## Prompt Templates for Common Situations

### Start a new feature
```
"Read CLAUDE.md first. Then explore [feature area] and create an
 implementation plan. Use plan mode — don't write any code yet.
 Include: exact files to change, test strategy, and any risks."
```

### Add a backend route (Phase 1+)
```
"Follow the add-api-route.md skill. Add POST /api/v1/[path].
 Write the contract test first. Standard error envelope required."
```

### Fix a failing test
```
"Follow the fix-failing-test.md skill. Don't change the test to
 hide the failure — fix the implementation."
```

### Expand car seat rules (Phase 2)
```
"Follow TDD. For state [XX]: research the current law,
 add a test that expects the correct law data,
 confirm it fails, then add the data to carSeatRules.js.
 Never expose developer jargon like 'not found in repo' to users."
```

### Add a React component (Phase 2+)
```
"Follow the add-component.md skill. Include:
 dark mode, accessibility aria-labels, PostHog event on key action,
 and Vitest component test."
```

### Internationalization (Phase 4)
```
"Before adding support for [country], run the market gate checklist:
 1. Test 5 destination prompts for the country
 2. Verify weather API returns data
 3. Verify safety mode returns country_general with correct sourceAuthority
 4. Check all error messages are non-US-specific"
```

---

## What Claude Code Should Never Do

- Edit `package-lock.json` or `.env` files (blocked by PreToolUse hook)
- Push directly to `main` (always use feature branches)
- Mark a feature done while tests are failing (Stop hook enforces this)
- Write safety/legal text without human review flag
- Use `git add -A` or `git add .` (may capture secrets)
- Skip the test-first step in TDD

---

## Escalation — When to Stop and Ask

Claude Code should pause and explicitly ask for human input when:

1. **Architectural ambiguity** — two valid approaches with different trade-offs
2. **Legal/safety text** — any user-visible text about car seats, international safety, or disclaimers
3. **Data model changes** — changes to localStorage key names/shapes that could corrupt existing user data
4. **External account setup** — anything requiring Apple Developer, Play Store, or API key creation
5. **Unexpected test failure cascade** — a change causes >3 previously passing tests to fail

---

## AI Change Log Index

All session logs are in `docs/ai-change-log/`. Each file is named by date.

Latest entries:
- `2026-02-21.md` — Phase 0 program setup (hooks, CI, skills, CLAUDE.md, playbook)
