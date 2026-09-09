-- Pixset Studio: бейджи в нике и видимость страны.
--
-- Что добавилось к 0006/0007:
--
--   1. Бейдж теперь бывает трёх повадок, и они независимы:
--        nick_allowed    — игрок МОЖЕТ поставить его рядом с ником;
--        nick_forced     — бейдж стоит рядом с ником ВСЕГДА, спрашивать нечего
--                          (так помечают статусы вроде «администратор»);
--        hide_in_profile — в профиле под ником не показывается.
--      Закрепление игрока живёт в user_badges.pinned и действует только для
--      nick_allowed: убрать «принудительный» бейдж игрок не может.
--
--   2. Страна аккаунта показывается в профиле, и видимость выбирает игрок:
--        public  — всем, friends — только друзьям (по умолчанию), none — никому.
--      Решение принимает база, а не клиент: иначе «скрыто» значило бы лишь
--      «не нарисовано», а данные всё равно уезжали бы в браузер.
--
-- Применить: Supabase → SQL Editor → выполнить целиком.

-- ── Повадки бейджа ────────────────────────────────────────────────────────
alter table public.badges
  add column nick_allowed    boolean not null default true,
  add column nick_forced     boolean not null default false,
  add column hide_in_profile boolean not null default false;

-- «Всегда в нике» подразумевает, что в нике он вообще разрешён.
alter table public.badges
  add constraint badge_forced_implies_allowed
  check (not nick_forced or nick_allowed);

-- Выданный бейдж сразу виден рядом с ником: игрок его заслужил, а не «получил
-- право когда-нибудь включить». Снять можно, если бейдж это разрешает.
alter table public.user_badges
  add column pinned boolean not null default true;

-- Своё закрепление игрок меняет сам — но только у тех бейджей, которые
-- разрешено ставить в ник. Проверку делает функция ниже, поэтому прямой
-- политики на update у клиента нет.
create function public.badge_pin(p_slug text, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me    uuid := (select auth.uid());
  badge public.badges%rowtype;
begin
  if me is null then raise exception 'not_authenticated'; end if;

  select * into badge from public.badges where slug = p_slug;
  if badge is null then raise exception 'badge_not_found'; end if;
  if not badge.nick_allowed then raise exception 'badge_not_pinnable'; end if;
  if badge.nick_forced then raise exception 'badge_always_pinned'; end if;

  update public.user_badges
     set pinned = coalesce(p_pinned, false)
   where user_id = me and badge_id = badge.id;

  if not found then raise exception 'badge_not_granted'; end if;
end;
$$;

-- ── Бейджи рядом с ником ──────────────────────────────────────────────────
-- Одна витрина на все списки сайта: друзья, поиск, таблицы рекордов, шапка.
-- Страница берёт бейджи сразу для всех ников списка одним запросом
-- (.in('nickname', […])), а не по игроку на строку.
create view public.nick_badges
with (security_invoker = true) as
  select p.nickname,
         b.slug, b.title_ru, b.title_en, b.hint_ru, b.hint_en,
         b.icon_url, b.color, b.nick_forced,
         ub.granted_at
    from public.user_badges ub
    join public.badges b   on b.id = ub.badge_id
    join public.profiles p on p.id = ub.user_id
   where b.nick_forced or (b.nick_allowed and ub.pinned)
   order by b.nick_forced desc, ub.granted_at;

-- Свои бейджи — с флагами, чтобы кабинет знал, что можно закрепить.
-- Пересоздаём целиком: «create or replace» умеет только дописывать колонки в
-- конец, а здесь меняется и порядок.
drop view if exists public.my_badges;
create view public.my_badges
with (security_invoker = true) as
  select b.slug, b.title_ru, b.title_en, b.hint_ru, b.hint_en,
         b.icon_url, b.color,
         b.nick_allowed, b.nick_forced, b.hide_in_profile,
         ub.pinned, ub.granted_at
    from public.user_badges ub
    join public.badges b on b.id = ub.badge_id
   where ub.user_id = (select auth.uid())
   order by b.nick_forced desc, ub.granted_at;

-- ── Видимость страны ──────────────────────────────────────────────────────
alter table public.profiles
  add column country_visibility text not null default 'friends'
  check (country_visibility in ('public', 'friends', 'none'));

-- Меняет только сам игрок. Отдельной функцией, а не update-политикой на
-- колонку: заодно отсекаем значения не из списка.
create function public.set_country_visibility(p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_mode not in ('public', 'friends', 'none') then raise exception 'bad_visibility'; end if;
  update public.profiles set country_visibility = p_mode where id = me;
end;
$$;

-- ── Публичный профиль ─────────────────────────────────────────────────────
-- Дополняем: страна (с учётом видимости) и бейджи для показа под ником.
-- Функция security invoker — auth.uid() внутри это тот, кто смотрит профиль,
-- поэтому «только друзьям» здесь можно посчитать честно.
create or replace function public.public_profile(p_nickname text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'nickname', p.nickname,
    'avatar_url', p.avatar_url,
    'created_at', p.created_at,
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
$$;

revoke execute on function public.badge_pin(text, boolean)      from public, anon;
revoke execute on function public.set_country_visibility(text)  from public, anon;

grant execute on function public.badge_pin(text, boolean)       to authenticated;
grant execute on function public.set_country_visibility(text)   to authenticated;
