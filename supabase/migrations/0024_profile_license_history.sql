-- Полная синхронизация сроков лицензий в публичном профиле.
--
-- my_entitlements отвечает только на вопрос «есть ли доступ сейчас».
-- Публичный профиль дополнительно показывает историю временного доступа,
-- поэтому здесь возвращаем как действующие, так и уже истёкшие записи, но
-- никогда не показываем отозванные лицензии.

create or replace function public.public_profile(p_nickname text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'nickname', p.nickname,
    'avatar_url', p.avatar_url,
    'created_at', p.created_at,
    'bio', p.bio,
    'banned', (p.banned_at is not null
               and (p.banned_until is null or p.banned_until > now())),
    'banned_until', case
      when p.banned_at is not null
       and (p.banned_until is null or p.banned_until > now()) then p.banned_until
      else null
    end,
    'country', case
      when p.country_visibility = 'public' then p.country
      when p.id = (select auth.uid()) then p.country
      when p.country_visibility = 'friends' and exists (
             select 1 from public.friendships f
              where f.status = 'accepted'
                and ((f.requester = (select auth.uid()) and f.addressee = p.id)
                  or (f.addressee = (select auth.uid()) and f.requester = p.id))
           ) then p.country
      else null
    end,
    'licenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_slug', l.game_slug,
        'title', g.title,
        'icon_url', g.icon_url,
        'granted_at', l.granted_at,
        'expires_at', l.expires_at,
        'active', (l.expires_at is null or l.expires_at > now()),
        'remaining_seconds', case
          when l.expires_at is null then null
          else greatest(0, floor(extract(epoch from (l.expires_at - now()))))::bigint
        end
      ) order by l.granted_at desc)
      from public.licenses l
      join public.games g on g.slug = l.game_slug
      where l.user_id = p.id and l.revoked_at is null
    ), '[]'::jsonb),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', b.slug,
        'title_ru', b.title_ru,
        'title_en', b.title_en,
        'hint_ru', b.hint_ru,
        'hint_en', b.hint_en,
        'icon_url', b.icon_url,
        'color', b.color,
        'nick', b.nick_forced or (b.nick_allowed and ub.pinned)
      ) order by b.sort_order, b.nick_forced desc, ub.granted_at)
      from public.user_badges ub
      join public.badges b on b.id = ub.badge_id
      where ub.user_id = p.id and not b.hide_in_profile
    ), '[]'::jsonb),
    'games', coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_slug', s.game_slug,
        'title', g.title,
        'data', s.data,
        'updated_at', s.updated_at
      ) order by s.updated_at desc)
      from public.game_stats s
      join public.games g on g.slug = s.game_slug
      where s.user_id = p.id
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.nickname = p_nickname;
$$;

comment on function public.public_profile(text) is
  'Public profile with active license state, expiry time, remaining seconds, and non-revoked license history.';
