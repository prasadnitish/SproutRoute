# Connect an assistant to a private SproutRoute library

The private connector URL is `https://<app-host>/api/v1/social-save/mcp`. The planning connector uses `/mcp`. Web and iOS sessions and delegated connector tokens share a Supabase user ID. The server verifies the connector JWT with the project's asymmetric public signing keys and pins its issuer, client, audience, role, expiration and grants. Direct app sessions use the ordinary authenticated audience.

The connector can list saved trip summaries, list confirmed places, and queue a link for review. Immediate extraction requires the tool's explicit option. Database operations use server-side credentials and constrain every lookup, update, or insert to the verified JWT subject. The MCP bearer is never forwarded to the Data API. Client-supplied owner IDs have no role in authorization.

## Configure a staging project

1. Deploy this branch to an HTTPS staging origin and apply the account, Social Save and account trips migrations to the same staging Supabase project as the web and iOS clients. Confirm PostgREST exposes these tables to the backend. The backend uses its existing server-only service key. Migrations 038 and 040 grant `select` on `public.social_places, public.account_trips` and `select, insert, update` on `public.social_inbox` to `service_role`, including for projects with default Data API grants disabled.
2. In Supabase **Authentication → Signing Keys**, configure ES256 or RS256 and verify the active public key is published at `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`. The private verifier accepts asymmetric tokens only.
3. In **Authentication → URL Configuration**, use the staging website as the project site URL. Configure the website’s sign-in callbacks for `/account` and the consent path with its authorization ID query, and retain the iOS return URLs. Check that a provider sign-in initiated from consent returns to that exact request. In **Authentication → OAuth Server**, enable the server and use `/oauth/consent` as its authorization path. Keep dynamic client registration disabled. This release uses pre-registered host clients because library access is explicitly allowlisted.
4. For each staging host, start its custom connector setup and copy its **exact displayed HTTPS redirect URI**. In the Supabase OAuth client settings create one client for that single callback, with authorization code + PKCE S256 and refresh enabled. Configure the host with the corresponding client ID, any issued confidential-client secret, and the `openid` scope. The consent UI allows one HTTPS callback per client with no fixed query or fragment. Use distinct client IDs for Claude and ChatGPT and for each environment.
5. Set Railway backend variables `MCP_PUBLIC_ORIGIN=https://<staging-app-host>`, `SUPABASE_URL=https://<staging-project-ref>.supabase.co`, `SUPABASE_ANON_KEY`, and `MCP_OAUTH_CLIENTS` to a JSON object mapping each registered client UUID to its exact callback string. The mapping contains public registration data. Keep host client secrets in their respective connector settings. Restart the service after changing the mapping.
6. Install the following SQL hook **in staging**, substitute the two connector IDs and exact deployed resource URL, and select it under **Authentication → Hooks → Custom Access Token**. If an existing hook handles this project, integrate this logic into it and preserve its native-session behavior. Supabase passes the trusted OAuth client ID in `event.claims.client_id` at code exchange and refresh. The hook binds each dedicated client to exactly one resource. `openid` is an identity scope. SproutRoute's private authorization grants are separate signed claims, displayed as concrete capabilities at consent. This template assumes these are the project's only delegated OAuth clients. Extend its per-client rules explicitly if other consumers already exist.

```sql
create or replace function public.sproutroute_mcp_claims(event jsonb)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  claims jsonb := event->'claims';
  connector text := claims->>'client_id';
begin
  if connector is null then
    return jsonb_build_object('claims', claims);
  end if;
  if connector not in ('STAGING_CLAUDE_CLIENT_UUID', 'STAGING_CHATGPT_CLIENT_UUID')
     or (claims->>'scope') is distinct from 'openid'
     or (claims->>'is_anonymous') is distinct from 'false' then
    raise exception 'Connector is unavailable for this account or scope';
  end if;
  claims := (claims - 'user_metadata' - 'app_metadata') || jsonb_build_object(
    'aud', 'https://STAGING-APP-HOST/api/v1/social-save/mcp',
    'role', 'sproutroute_mcp',
    'email', '', 'phone', '',
    'sproutroute_permissions', jsonb_build_array('library:read', 'library:write')
  );
  return jsonb_build_object('claims', claims);
end;
$$;
revoke all on function public.sproutroute_mcp_claims(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.sproutroute_mcp_claims(jsonb) to supabase_auth_admin;
```

The `sproutroute_mcp` claim is a resource marker. Do **not** grant this role to PostgREST's `authenticator` or assign it database permissions. The staging user must retain access through ordinary web and native sessions. Set the staging issuer access-token lifetime to at most 3,600 seconds (15 minutes if acceptable for existing clients). The resource rejects tokens missing issuance time or issued for longer than one hour. Revoking a grant stops refresh, while a signed token can authenticate until expiry, at most one hour. Deleting the account cascades its trip, place, and inbox rows. A still-valid JWT can authenticate until expiry, but finds no owned rows and cannot recreate inbox data because the owner foreign key no longer exists. Removing a client from the backend allowlist and restarting immediately disables that connector.

## Verify with a staging host

1. GET `/.well-known/oauth-protected-resource/api/v1/social-save/mcp` on the staging origin. Verify the canonical resource, the staging issuer ending in `/auth/v1` and the `openid` scope. An unauthenticated POST to the private connector should return HTTP 401 with a Bearer `resource_metadata` challenge pointing at that document. Discover authorization-server metadata at `https://<project-ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1` and verify S256.
2. Use a disposable staging account with distinguishable saved trips and places. Connect the host, sign in to that same account, deny once, reconnect, and approve. Confirm the connector name, the account, and the callback hostname shown by the consent screen. Check a refresh grants the same audience and permissions. Never paste live codes or tokens into logs or public JWT decoders.
3. Run `list_saved_places`, `list_saved_trips` and `save_place_from_url` with immediate extraction off. Confirm the link appears only in the granting account's review inbox. Repeat with a second test account and verify isolation. Verify the connector credential is refused at private REST and direct PostgREST, the app credential is refused at private MCP, and the app credential still works on native library REST.
4. Revoke the test user's grant via Supabase's OAuth grant management, verify refresh fails, then verify calls fail after the old access token expires. Repeat connection checks in each supported host before claiming host compatibility. Keep production client registration, hook installation, credentials and directory submission separate from staging.

[Supabase JWT verification and JWKS](https://supabase.com/docs/guides/auth/jwts#verifying-a-jwt-from-supabase) · [Supabase Auth token issuance and hook schema](https://github.com/supabase/auth/blob/master/internal/tokens/service.go) · [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication) · [Supabase OAuth setup and consent](https://supabase.com/docs/guides/auth/oauth-server/getting-started) · [Token security and custom audiences](https://supabase.com/docs/guides/auth/oauth-server/token-security) · [Custom access token hook contract](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) · [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
