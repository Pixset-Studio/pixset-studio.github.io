-- Pixset Studio: сколько бейджей влезает в ник и в каком они порядке.
--
-- Что меняется к 0008:
--
--   1. Слот в нике один. Бейджи с nick_forced стоят рядом с ником всегда и
--      места не занимают — их выдаёт студия и снять их игрок не может. А вот
--      из «необязательных» (nick_allowed без nick_forced) рядом с ником живёт
--      РОВНО ОДИН, выбранный игроком. Раньше туда влезали все сразу, и ник
--      обрастал гирляндой иконок.
--
--      Выбор ведёт себя как переключатель, а не как запрет: отметил другой —
--      прежний освободил слот. Отказать было бы честно формально, но игроку
--      пришлось бы догадываться, какой из бейджей мешает.
--
--   2. Порядок задаёт игрок. Чем главнее бейдж, тем он левее — то есть ближе
--      к нику. Порядок живёт в user_badges.nick_order (меньше — главнее) и
--      действует и в нике, и в разделе бейджей публичного профиля.
--
-- Применить: Supabase → SQL Editor → выполнить целиком.

-- ── Порядок ───────────────────────────────────────────────────────────────
-- 0 — «порядок не задан»: такие бейджи идут перед расставленными вручную и
-- между собой сортируются как раньше (сначала бейджи студии, потом по дате
-- выдачи). Так у тех, кто ничего не трогал, ник выглядит ровно как до этой
-- миграции.
alter table public.user_badges
  add column nick_order integer not null default 0;

-- ── Один слот на выбор игрока ─────────────────────────────────────────────
-- Проверка живёт в базе, а не только в функциях: pinned меняет и badge_pin, и
-- выдача бейджа, и когда-нибудь может тронуть админка. Правило одно на всех.
create or replace function public.badge_slot_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
begin
  select count(*) into used
    from public.user_badges ub
    join public.badges b on b.id = ub.badge_id
   where ub.user_id = new.user_id
     and ub.pinned and b.nick_allowed and not b.nick_forced;

  if used > 1 then raise exception 'nick_slot_taken'; end if;
  return new;
end;
$$;

create constraint trigger user_badges_slot
  after insert or update on public.user_badges
  deferrable initially deferred
  for each row execute function public.badge_slot_guard();

-- ── Закрепить бейдж ───────────────────────────────────────────────────────
-- Отличие от 0008: включение освобождает слот от прежнего бейджа.
create or replace function public.badge_pin(p_slug text, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me    uuid := (select auth.uid());
  badge public.badges%rowtype;
  want  boolean := coalesce(p_pinned, false);
begin
  perform public.assert_not_banned();   -- забаненному действие запрещено
  if me is null then raise exception 'not_authenticated'; end if;

  select * into badge from public.badges where slug = p_slug;
  if badge is null then raise exception 'badge_not_found'; end if;
  if not badge.nick_allowed then raise exception 'badge_not_pinnable'; end if;
  if badge.nick_forced then raise exception 'badge_always_pinned'; end if;

  if not exists (select 1 from public.user_badges
                  where user_id = me and badge_id = badge.id) then
    raise exception 'badge_not_granted';
  end if;

  -- Слот один: снимаем прежний выбор до того, как поставить новый.
  if want then
    update public.user_badges ub
       set pinned = false
      from public.badges b
     where b.id = ub.badge_id
       and ub.user_id = me and ub.pinned
       and b.nick_allowed and not b.nick_forced
       and b.id <> badge.id;
  end if;

  update public.user_badges
     set pinned = want
   where user_id = me and badge_id = badge.id;
end;
$$;

-- ── Кто главнее ───────────────────────────────────────────────────────────
-- Игрок присылает свои бейджи в нужном порядке — первый в списке стоит ближе
-- всех к нику. Чужие и невыданные слаги молча пропускаем: список приходит из
-- браузера, и падать из-за устаревшей страницы незачем.
create or replace function public.badge_order(p_slugs text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := (select auth.uid());
begin
  perform public.assert_not_banned();
  if me is null then raise exception 'not_authenticated'; end if;
  if p_slugs is null then return; end if;
  if array_length(p_slugs, 1) > 50 then raise exception 'too_many_badges'; end if;

  -- Сначала все свои — в конец очереди, потом перечисленные — по местам.
  update public.user_badges set nick_order = 999 where user_id = me;

  update public.user_badges ub
     set nick_order = pos.ord
    from (select slug, ordinality::integer as ord
            from unnest(p_slugs) with ordinality as t(slug, ordinality)) pos
    join public.badges b on b.slug = pos.slug
   where ub.user_id = me and ub.badge_id = b.id;
end;
$$;

-- ── Выдача бейджа ─────────────────────────────────────────────────────────
-- Новый бейдж занимает слот, только если тот свободен: иначе выдача молча
-- вытеснила бы выбор игрока.
create or replace function public.badge_grant(p_nickname text, p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := (select auth.uid());
  target   uuid;
  badge    public.badges%rowtype;
  slot_use boolean;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = me and is_admin) then
    raise exception 'forbidden';
  end if;

  select id into target from public.profiles where nickname = p_nickname;
  if target is null then raise exception 'player_not_found'; end if;

  select * into badge from public.badges where slug = p_slug;
  if badge is null then raise exception 'badge_not_found'; end if;

  select exists (
    select 1 from public.user_badges ub
      join public.badges b on b.id = ub.badge_id
     where ub.user_id = target
       and ub.pinned and b.nick_allowed and not b.nick_forced
  ) into slot_use;

  insert into public.user_badges (user_id, badge_id, granted_by, pinned)
  values (target, badge.id, me,
          badge.nick_allowed and (badge.nick_forced or not slot_use))
  on conflict (user_id, badge_id) do nothing;   -- повторная выдача не ошибка
end;
$$;

-- ── Витрины ───────────────────────────────────────────────────────────────
-- Пересоздаём целиком: меняется порядок сортировки и набор колонок.
drop view if exists public.nick_badges;
create view public.nick_badges
with (security_invoker = true) as
  select p.nickname,
         b.slug, b.title_ru, b.title_en, b.hint_ru, b.hint_en,
         b.icon_url, b.color, b.nick_forced,
         ub.nick_order, ub.granted_at
    from public.user_badges ub
    join public.badges b   on b.id = ub.badge_id
    join public.profiles p on p.id = ub.user_id
   where b.nick_forced or (b.nick_allowed and ub.pinned)
   order by ub.nick_order, b.nick_forced desc, ub.granted_at;

drop view if exists public.my_badges;
create view public.my_badges
with (security_invoker = true) as
  select b.slug, b.title_ru, b.title_en, b.hint_ru, b.hint_en,
         b.icon_url, b.color,
         b.nick_allowed, b.nick_forced, b.hide_in_profile,
         b.auto_game, b.auto_field, b.auto_min,
         ub.pinned, ub.nick_order, ub.granted_at
    from public.user_badges ub
    join public.badges b on b.id = ub.badge_id
   where ub.user_id = (select auth.uid())
   order by ub.nick_order, b.nick_forced desc, ub.granted_at;

-- Публичный профиль: тот же порядок, что и в нике.
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
      ) order by ub.nick_order, b.nick_forced desc, ub.granted_at)
      from public.user_badges ub
      join public.badges b on b.id = ub.badge_id
      where ub.user_id = p.id and not b.hide_in_profile
    ), '[]'::jsonb),
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

revoke execute on function public.badge_order(text[]) from public, anon;
grant  execute on function public.badge_order(text[]) to authenticated;

-- ── Разбор завалов ────────────────────────────────────────────────────────
-- У кого рядом с ником уже висело несколько «необязательных» бейджей, слот
-- достаётся первому по прежнему порядку — тому, что и так стоял ближе к нику.
update public.user_badges ub
   set pinned = false
  from public.badges b
 where b.id = ub.badge_id
   and ub.pinned and b.nick_allowed and not b.nick_forced
   and ub.badge_id <> (
     select ub2.badge_id
       from public.user_badges ub2
       join public.badges b2 on b2.id = ub2.badge_id
      where ub2.user_id = ub.user_id
        and ub2.pinned and b2.nick_allowed and not b2.nick_forced
      order by ub2.nick_order, ub2.granted_at
      limit 1);
