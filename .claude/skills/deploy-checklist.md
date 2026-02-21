# Deploy Checklist

Run through this before every deployment to production.

## Pre-deploy (always)

```bash
# 1. Run full test suite — must be green
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout"
npm test

# 2. Frontend build — must succeed without errors
cd src/frontend && npm run build && cd ../..

# 3. Check for leaked secrets (never commit these)
git diff --cached | grep -E "(sk-ant|ANTHROPIC_API_KEY|deepseek|password|secret)" && echo "SECRET DETECTED — abort" || echo "No secrets detected"

# 4. Verify you're on a feature branch (never deploy directly from main development)
git branch --show-current
```

## Deploy to Railway (SproutRoute app)

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout"

# Stage only specific files (never `git add -A` — may capture .env)
git add src/backend/[files] src/frontend/[files] tests/[files]

# Commit
git commit -m "feat: [description]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

# Push to trigger Railway auto-deploy
git push origin [branch-name]

# Watch deploy logs (takes 2-3 min)
railway logs --build --service SproutRoute --lines 50
railway logs --service SproutRoute --lines 30
```

## Deploy to Cloudflare (portfolio website only)

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio"
wrangler deploy
# Takes ~5 seconds. Verify at https://www.nitishprasad.com
```

## Post-deploy verification

```bash
# 1. Health check
curl https://sproutroute-production.up.railway.app/api/health

# 2. Quick smoke test — resolve a destination
curl -X POST https://sproutroute-production.up.railway.app/api/resolve-destination \
  -H "Content-Type: application/json" \
  -d '{"destination": "Denver, CO"}' | python3 -m json.tool

# 3. Check Railway runtime logs for startup errors
railway logs --service SproutRoute --lines 20
```

## If deploy fails

```bash
# Check build logs
railway logs --build --service SproutRoute --lines 100

# Check runtime logs
railway logs --service SproutRoute --lines 50

# Common causes:
# - npm install failed → check package.json for invalid deps
# - Vite build failed → run `cd src/frontend && npm run build` locally first
# - PORT not binding → ensure server.js uses `process.env.PORT || 3000`
# - Missing env var → check `railway variables --service SproutRoute --json`
```

## Environment variables (Railway)

| Var | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Enables static serving |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Claude AI (primary or fallback) |
| `AI_PROVIDER` | `anthropic` or `deepseek` | Switch models |
| `DEEPSEEK_API_KEY` | `sk-...` | DeepSeek V3 (Phase 2+) |
| `VITE_API_URL` | `https://sproutroute-production.up.railway.app` | Baked into Vite build |
| `NPM_CONFIG_PRODUCTION` | `false` | Allows devDeps in Railway build |
| `ALLOWED_ORIGINS` | `https://sproutroute-production.up.railway.app,http://localhost:5173` | CORS |
| `POSTHOG_API_KEY` | `phc_...` | Analytics (Phase 2+) |
| `OPENWEATHERMAP_API_KEY` | `...` | International weather (Phase 4+) |

## Branch strategy reminder

```
main          → always deployable; Railway auto-deploys
feature/*     → all development
hotfix/*      → urgent production fixes

Workflow:
  git checkout -b feature/phase2-ux-fixes
  [build + test]
  git push origin feature/phase2-ux-fixes
  [PR → GitHub Actions tests → merge to main → Railway deploys]
```
