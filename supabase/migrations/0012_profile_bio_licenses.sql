-- ============================================================================
--  Описание в профиле и список игр игрока
--
--  Профиль показывал только ник, дату и цифры прогресса. Двух вещей не
--  хватало: пары слов о себе и ответа на вопрос «во что этот человек вообще
--  играет» — лицензии видел лишь он сам в своём кабинете.
-- ============================================================================

alter table public.profiles
  add column if not exists bio text;

alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles add constraint profiles_bio_len
  check (bio is null or char_length(bio) <= 300);

comment on column public.profiles.bio is
  'Пара слов о себе, показывается в публичном профиле. До 300 символов.';

-- Публичный профиль: описание и купленные игры.
create or replace function public.public_profile(p_nickname text)
returns jsonb
language sql stable set search_path = public as $function$
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
    -- Игры, на которые есть действующая лицензия. Отозванные не показываем:
    -- это витрина, а не история покупок.
    'licenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_slug', l.game_slug,
        'title', g.title,
        'granted_at', l.granted_at
      ) order by l.granted_at)
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
      ) order by b.nick_forced desc, ub.granted_at)
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
$function$;
