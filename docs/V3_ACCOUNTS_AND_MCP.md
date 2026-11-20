# V3 accounts, saved trips and planning connectors

Work continues on the two `feature/v3` branches. The backend PR targets main. The iOS PR targets the build 18 branch so that its diff isolates v3. Coordinate both releases after the current app launch.

## Requirements and delivery order

| Order | User outcome | Acceptance |
| --- | --- | --- |
| 1 | Plan before creating an account. Keep a trip using email, Google or Apple. | A sign-in redirect preserves the trip awaiting confirmation. A second account cannot see the first account's library. Check Apple relay addresses and first-authorization name capture on a signed device. |
| 2 | Reopen saved trips and family preferences on another device. Link or remove an account from settings. | Read the same account-owned itinerary from iOS and web, confirm before copying family preferences, prove control of both accounts before a merge, and verify deletion of all owned data. |
| 3 | Ask an assistant to plan a family trip. Read the itinerary in text or interact with day tabs, verified stops and swaps. | Discover the resource, poll a slow generation, inspect a stop, swap it, synchronize the conversation, and open the latest itinerary on the website. Save only after the traveler confirms. |
| 4 | Connect an assistant to a private library. | Deny and approve an OAuth request, test two accounts, verify permissions on both MCP and ordinary REST, and revoke the grant. |
| 5 | Let a browser assistant prepare a trip or search the open itinerary. | WebMCP is opt-in. Check registration, unregistration, unsupported browsers, and traveler confirmation before any AI spend. |

Sources are the [Accounts & Sign-In brief](https://app.notion.com/p/41e8af9d5e738140aee8cccf12bcc006), [MCP App and WebMCP brief](https://app.notion.com/p/41e8af9d5e7381618c52def008bc9e0f), and [Social Save research ledger](SOCIAL_SAVE.md). Subscription entitlements, prices, and storefront submissions belong to the separate [Premium brief](https://app.notion.com/p/41e8af9d5e73812683ccc57d6deae85b).

## Production baseline

An authenticated check on November 20, 2026 reached both MCP initialization and tool discovery at https://sproutroute.app/mcp. Discovery advertised two tools, `plan_trip` and `get_agent_trace`. A three-day Seattle family trip, one-day Portland trip, and two-day San Diego toddler trip returned successful tool responses in 26.9s, 14.5s and 18.2s respectively. All returned JSON in text content. These measurements verify transport and response shape only. HTTPS chain verification passed on the custom and Railway domains. Certificate renewal requires monitoring at the hosting provider.

## Staging and release

1. Back up the staging database and apply migrations 037 through 040 in order. Check existing public user IDs against auth.users before introducing the lifecycle foreign key. Use the same Supabase project and auth identities on all clients. Run the account database integration test locally against disposable PostgreSQL with `node --test tests/integration/accountDatabase.test.js`.
2. Configure email code delivery, the Apple capability, Services ID, Google OAuth clients, exact redirects, and manual identity linking for staging. Include `sproutroute://account/callback` in allowed mobile return URLs. Verify provider sign-in, duplicate-account merge, deletion and revocation with disposable users. Configure Apple relay email delivery. Test confirmation mail on a different device. See [account deletion and merge](ACCOUNT_LIFECYCLE.md) for revocation credentials and failure recovery.
3. Set `SPROUTROUTE_WEB_ORIGIN` to the HTTPS staging web origin for itinerary handoff. The planning connector uses a shared installation credential. It caps trips at seven days, limits simultaneous jobs to three and allows ten generations per hour for the credential. Each job gets up to $0.50 in estimated itinerary-model spend. Keep planning credentials separate from account grants. Follow the [private connector setup](MCP_ACCOUNT_LINKING.md) for client registration, claim hooks, the consent screen and revocation. Test both a text-only MCP client and the actual Claude and ChatGPT hosts. Planning jobs expire after 30 minutes and live in one server process. A restart expires them; keep one planning instance until job state is shared across replicas.
4. Enable the browser experiment in the staging frontend build with `VITE_WEBMCP_ENABLED=true`. Supply `VITE_WEBMCP_ORIGIN_TRIAL_TOKEN` when the target browser requires an origin trial, and validate the exact hostname and expiry. Verify the standard browser planner with the experiment off. With consent, count `webmcp_plan_trip` and `webmcp_search_places` feature uses to evaluate demand.
5. Complete signed-device testing and the host connector checks before release. Deploy the compatible backend and migrations before distributing the native build. Keep the additive schema when rolling back code so existing account libraries survive. Directory submissions, production migration, signing and release require separate authorization.

## Branch validation

The Node suite passed 1,148 tests, including the migration and OAuth claim-hook tests in disposable PostgreSQL. The default frontend build passed 105 Chromium browser tests. Its native WebMCP case skips when the experiment is disabled. All three WebMCP browser tests passed in an enabled build using Chrome 158 with the experimental API active. The MCP widget ran in a sandboxed iframe harness. Provider login, Apple revocation, production origin-trial enrollment and rendering in the actual assistant hosts require staging credentials and host configuration.
