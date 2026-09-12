-- Pixset Studio: порядок бейджей задаёт сам каталог.
--
-- Что меняется к 0014/0016:
--
--   Раньше порядок был у КАЖДОГО игрока свой (user_badges.nick_order), и его
--   приходилось выставлять отдельно каждому — сначала это делал игрок, потом
--   администратор через «Порядок в нике». Настоящее правило проще: важность у
--   бейджа одна на всех. «Разработчик» главнее «Бета-тестера» у любого, кому
--   оба выданы, — значит и хранить это надо один раз, у самого бейджа.
--
--   Теперь порядок — это badges.sort_order: чем меньше число, тем выше бейдж в
--   списке каталога и тем ближе он стоит к нику. Персональный nick_order
--   уезжает целиком: два источника правды об одном и том же расходятся тем
--   быстрее, чем реже в них смотрят.
--
--   Что игрок решает сам, не изменилось: слот у ника один, и какой из
--   необязательных бейджей его займёт, выбирает он (badge_pin из 0014).
--
-- Применить: Supabase → SQL Editor → выполнить целиком.

-- ── Порядок в каталоге ────────────────────────────────────────────────────
-- 1000 по умолчанию — новый бейдж встаёт в конец списка, а не втискивается в
-- середину: где ему место, решит студия, а до этого он не должен молча
-- оттеснять уже расставленные.
alter table public.badges
  add column sort_order integer not null default 1000;

-- Начальные места — по дате создания, ровно в том порядке, в каком каталог и
-- показывался до этой миграции. Шаг 10 оставлен намеренно: он не нужен коду
-- (перестановка всегда переписывает весь список), но позволяет поправить
-- одно число руками в SQL Editor, не трогая соседей.
update public.badges b
   set sort_order = r.n
  from (select slug, (row_number() over (order by created_at))::integer * 10 as n
          from public.badges) r
 where r.slug = b.slug;

-- ── Витрины ───────────────────────────────────────────────────────────────
-- Пересоздаём целиком: nick_order из них уходит, sort_order приходит. Views
-- сносим до того, как удалить колонку, — иначе drop column не даст этого
-- сделать, пока она в них упоминается.
drop view if exists public.nick_badges;
create view public.nick_badges
with (security_invoker = true) as
  select p.nickname,
         b.slug, b.title_ru, b.title_en, b.hint_ru, b.hint_en,
         b.icon_url, b.color, b.nick_forced, b.sort_order,
         ub.granted_at
    from public.user_badges ub
    join public.badges b   on b.id = ub.badge_id
    join public.profiles p on p.id = ub.user_id
   where b.nick_forced or (b.nick_allowed and ub.pinned)
   order by b.sort_order, b.nick_forced desc, ub.granted_at;

drop view if exists public.my_badges;
create view public.my_badges
with (security_invoker = true) as
  select b.slug, b.title_ru, b.title_en, b.hint_ru, b.hint_en,
         b.icon_url, b.color,
         b.nick_allowed, b.nick_forced, b.hide_in_profile, b.sort_order,
         b.auto_game, b.auto_field, b.auto_min,
         ub.pinned, ub.granted_at
    from public.user_badges ub
    join public.badges b on b.id = ub.badge_id
   where ub.user_id = (select auth.uid())
   order by b.sort_order, b.nick_forced desc, ub.granted_at;

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
    'licenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_slug', l.game_slug,
        'title', g.title,
        'icon_url', g.icon_url,
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

-- ── Персональный порядок больше не нужен ──────────────────────────────────
drop function if exists public.admin_badge_order(text, text[]);
alter table public.user_badges drop column if exists nick_order;

-- ── Перестановка каталога ─────────────────────────────────────────────────
-- Админка присылает слаги в том порядке, в каком они лежат в списке: первый —
-- главный. Незнакомые слаги молча пропускаем (список пришёл из браузера и мог
-- устареть), а те, что в присланный список не попали, остаются на своих
-- местах: перестановка не должна ронять в конец бейдж, созданный в соседней
-- вкладке минуту назад.
create or replace function public.admin_badges_order(p_slugs text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = me and is_admin) then
    raise exception 'forbidden';
  end if;
  if p_slugs is null or array_length(p_slugs, 1) is null then return; end if;
  if array_length(p_slugs, 1) > 200 then raise exception 'too_many_badges'; end if;

  update public.badges b
     set sort_order = pos.ord * 10
    from (select slug, ordinality::integer as ord
            from unnest(p_slugs) with ordinality as t(slug, ordinality)) pos
   where b.slug = pos.slug;
end;
$$;

revoke execute on function public.admin_badges_order(text[]) from public, anon;
grant  execute on function public.admin_badges_order(text[]) to authenticated;
