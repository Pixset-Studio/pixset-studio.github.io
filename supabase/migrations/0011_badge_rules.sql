-- ============================================================================
--  Бейджи за достижения в играх
--
--  Раньше бейдж выдавал только человек. Теперь у бейджа может быть правило:
--  «в такой-то игре такой-то показатель дорос до такого-то значения» — и он
--  выдаётся сам, как только игра пришлёт свежую сводку прогресса.
--
--      auto_game  — slug игры (game_stats.game_slug)
--      auto_field — ключ в сводке: levels, kills, completion, playtime …
--      auto_min   — порог, начиная с которого бейдж считается заслуженным
--                   (completion приходит долей: 1 = «пройдено на 100%»)
--
--  Выданный бейдж назад не забирается: достижение — про однажды сделанное,
--  а не про текущее состояние. Обнулил игрок сохранение — награда остаётся.
-- ============================================================================

alter table public.badges
  add column if not exists auto_game  text references public.games(slug),
  add column if not exists auto_field text,
  add column if not exists auto_min   numeric;

comment on column public.badges.auto_field is
  'Ключ показателя в game_stats.data — тот же, что показывает публичный профиль.';

-- Правило либо описано целиком, либо его нет вовсе: половина условия молча
-- не выдавала бы ничего и выглядела бы как поломка.
alter table public.badges drop constraint if exists badges_auto_rule_complete;
alter table public.badges add constraint badges_auto_rule_complete check (
  (auto_game is null and auto_field is null and auto_min is null)
  or (auto_game is not null and auto_field is not null and auto_min is not null)
);

/* Число из сводки. Значения приходят от игры, среди них есть и строки
   («rank3»), поэтому берём только то, что действительно число. */
create or replace function public.stat_number(p_data jsonb, p_field text)
returns numeric
language sql immutable set search_path = public as $$
  select case
    when p_data ->> p_field ~ '^-?[0-9]+(\.[0-9]+)?$' then (p_data ->> p_field)::numeric
    else null
  end;
$$;

/**
 * Выдаёт игроку все бейджи, чьи условия он уже выполнил. Возвращает, сколько
 * выдано нового. Зовётся сама при публикации прогресса — игроку ничего
 * нажимать не нужно.
 */
create or replace function public.badges_autogrant(p_user uuid default auth.uid())
returns integer
language plpgsql security definer set search_path = public as $$
declare
  granted integer := 0;
begin
  if p_user is null then return 0; end if;

  insert into public.user_badges (user_id, badge_id, pinned)
  select p_user, b.id, b.nick_allowed
    from public.badges b
    join public.game_stats s
      on s.user_id = p_user and s.game_slug = b.auto_game
   where b.auto_game is not null
     and public.stat_number(s.data, b.auto_field) >= b.auto_min
  on conflict (user_id, badge_id) do nothing;

  get diagnostics granted = row_count;
  return granted;
end;
$$;

/** Пересчёт по всем игрокам — для только что заведённого правила. */
create or replace function public.admin_badges_recheck()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  granted integer := 0;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  insert into public.user_badges (user_id, badge_id, pinned)
  select s.user_id, b.id, b.nick_allowed
    from public.badges b
    join public.game_stats s on s.game_slug = b.auto_game
   where b.auto_game is not null
     and public.stat_number(s.data, b.auto_field) >= b.auto_min
  on conflict (user_id, badge_id) do nothing;

  get diagnostics granted = row_count;
  return granted;
end;
$$;

grant execute on function public.stat_number(jsonb, text) to authenticated, anon;
grant execute on function public.badges_autogrant(uuid) to authenticated;
grant execute on function public.admin_badges_recheck() to authenticated;

-- ── Правило проверяется при каждой публикации прогресса ─────────────────────
create or replace function public.publish_game_stats(p_game_slug text, p_data jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
begin
  perform public.assert_not_banned();   -- забаненному действие запрещено
  if me is null then raise exception 'not_authenticated'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'bad_stats';
  end if;
  -- Витрина, а не архив: держим её маленькой, чтобы никто не сложил в неё
  -- сохранение целиком.
  if length(p_data::text) > 4000 then raise exception 'stats_too_big'; end if;

  insert into public.game_stats (user_id, game_slug, data, updated_at)
  values (me, p_game_slug, p_data, now())
  on conflict (user_id, game_slug)
  do update set data = excluded.data, updated_at = now();

  -- Достижения проверяем здесь же: игра присылает сводку после каждого
  -- заметного события, и бейдж появляется у игрока сам.
  perform public.badges_autogrant(me);
end;
$$;

-- ── Правило видно там же, где остальные свойства бейджа ─────────────────────
drop view if exists public.my_badges;
create view public.my_badges with (security_invoker = true) as
select b.slug, b.title_ru, b.title_en, b.hint_ru, b.hint_en, b.icon_url, b.color,
       b.nick_allowed, b.nick_forced, b.hide_in_profile,
       b.auto_game, b.auto_field, b.auto_min,
       ub.granted_at, ub.pinned
  from public.user_badges ub
  join public.badges b on b.id = ub.badge_id
 where ub.user_id = (select auth.uid())
 order by b.nick_forced desc, ub.granted_at;

grant select on public.my_badges to authenticated;
