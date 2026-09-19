-- Pixset Studio: authoritative entitlement expiry
--
-- Keep the entitlement boundary in the database view used by the website,
-- store, download/archive gates, and client SDK.  This migration is
-- intentionally idempotent so it also repairs projects where the original
-- promo migration was applied before the temporary-license view was added.

create or replace view public.my_entitlements
with (security_invoker = true) as
  select l.game_slug, l.granted_at, l.expires_at
    from public.licenses l
   where l.user_id = (select auth.uid())
     and l.revoked_at is null
     and (l.expires_at is null or l.expires_at > now());

comment on view public.my_entitlements is
  'Currently active licenses only; temporary promo licenses disappear immediately after expires_at.';

-- Keep direct table reads safe for clients that have not yet switched to the
-- view.  The view remains the canonical API, but this index makes expiry
-- checks cheap for every caller and for PostgREST refreshes.
create index if not exists licenses_active_lookup_idx
  on public.licenses (user_id, game_slug, expires_at)
  where revoked_at is null;
