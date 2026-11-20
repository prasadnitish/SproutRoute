begin;
-- Private MCP tools access these tables with a server-owned credential,
-- after the API verifies the user's resource-bound delegated token.
grant select on public.social_places to service_role;
grant select, insert, update on public.social_inbox to service_role;
commit;
