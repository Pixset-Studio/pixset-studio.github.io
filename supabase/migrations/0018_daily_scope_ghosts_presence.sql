-- Pixset Studio: уровень дня, охват таблиц, призраки забегов, присутствие и
-- поиск игроков.
--
-- Пять частей, все они нужны одному разговору «а как у других»:
--
--   1. ОХВАТ. Таблицы рекордов из 0004/0005 показывали только мир целиком.
--      Теперь у них есть охват: мир, своя страна, друзья. Страна берётся из
--      профиля и участвует, только если игрок показывает её всем: страновая
--      доска публична, и тащить в неё скрытую страну нельзя.
--
--   2. УРОВЕНЬ ДНЯ. Пять слотов в сутки (лёгкий, средний, сложный, случайный,
--      случайный с мутатором). Сам уровень нигде не хранится — он собирается
--      из даты и слота тем же генератором, что и кампания, поэтому у всех
--      получается одинаковым. Здесь лежат только результаты, по одному на
--      игрока, слот и день: попыток сколько угодно, в зачёт лучшая.
--
--      День считается по UTC. Иначе «сегодня» у Владивостока и Лиссабона —
--      разные уровни, и общая таблица распадается.
--
--   3. ПРИЗРАКИ. Запись лучшего забега: не позиции, а нажатия — на уровень
--      уходят килобайты, а не мегабайты. Хранится ОДНА запись на уровень
--      (рекордная): кампания и хардкор отдельно, у уровня дня — своя на слот.
--
--   4. ПРИСУТСТВИЕ. Игра отмечается раз в полминуты, сайты читают счётчик.
--      Здесь считаются только вошедшие: анонимную отметку может прислать кто
--      угодно сколько угодно раз, и счётчик перестал бы что-то значить.
--
--   5. ПОИСК ИГРОКОВ. Один запрос по нику — для страницы «Игроки» и для
--      подсказок во всех полях с ником, включая админку.
--
-- ЧЕСТНОЕ ОГРАНИЧЕНИЕ то же, что в 0004: счёт присылает клиент, проверить его
-- сервер не может. Здесь стоит лишь то, что реально помогает — «только вверх»,
-- потолок значения, одна запись на игрока.
--
-- Применить: Supabase → SQL Editor → выполнить целиком.

-- ═══ 1. Охват таблиц ══════════════════════════════════════════════════════
-- Кто попадает в доску при выбранном охвате. Возвращает пусто для 'world' —
-- вызывающий в этом случае просто не фильтрует (см. top_scores ниже).
--
-- security definer здесь обязателен: в friendships и profiles политики
-- показывают вошедшему не всё, а нам нужно построить список независимо от
-- того, кого он «видит» — наружу всё равно уходят только id.
create or replace function public.scope_users(p_scope text)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  -- Свои: в обеих досках человек должен видеть себя.
  select (select auth.uid())
   where p_scope in ('country', 'friends') and (select auth.uid()) is not null
  union
  -- Земляки: только те, кто показывает страну всем.
  select p.id
    from public.profiles p
   where p_scope = 'country'
     and p.country_visibility = 'public'
     and p.country is not null
     and p.country = (select c.country from public.profiles c where c.id = (select auth.uid()))
  union
  -- Друзья: принятая дружба в любую сторону.
  select case when f.requester = (select auth.uid()) then f.addressee else f.requester end
    from public.friendships f
   where p_scope = 'friends'
     and f.status = 'accepted'
     and (select auth.uid()) in (f.requester, f.addressee);
$$;

grant execute on function public.scope_users(text) to authenticated;

-- Доски режимов и показателей — те же, что в 0004/0005, плюс охват. Старые
-- вызовы без p_scope продолжают работать: значение по умолчанию — весь мир.
drop function if exists public.top_scores(text, public.leaderboard_mode, int);
create function public.top_scores(
  p_game_slug text,
  p_mode public.leaderboard_mode,
  p_limit int default 50,
  p_scope text default 'world'
)
returns table (
  rank int,
  user_id uuid,
  nickname text,
  avatar_url text,
  score bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    row_number() over (order by l.score desc, l.updated_at asc)::int as rank,
    l.user_id,
    p.nickname,
    p.avatar_url,
    l.score,
    l.updated_at
  from public.leaderboard l
  join public.profiles p on p.id = l.user_id
  where l.game_slug = p_game_slug and l.mode = p_mode
    and (coalesce(p_scope, 'world') = 'world'
         or l.user_id in (select s.user_id from public.scope_users(p_scope) s))
  order by l.score desc, l.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

drop function if exists public.top_stats(text, text, int);
create function public.top_stats(
  p_game_slug text,
  p_field text,
  p_limit int default 50,
  p_scope text default 'world'
)
returns table (
  rank int,
  user_id uuid,
  nickname text,
  avatar_url text,
  value bigint,
  data jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    row_number() over (order by (g.data->>p_field)::bigint desc, g.updated_at asc)::int,
    g.user_id,
    p.nickname,
    p.avatar_url,
    (g.data->>p_field)::bigint,
    g.data,
    g.updated_at
  from public.game_stats g
  join public.profiles p on p.id = g.user_id
  where g.game_slug = p_game_slug
    and p_field in ('levels','stars','crystals','coins','ach','logs','bosses',
                    'secrets','worlds','rainbow','perfect','streak','playtime',
                    'score','hardcore','jumps','stompKills','blasterKills',
                    'burnKills','freezeKills')
    and (g.data->>p_field) ~ '^[0-9]+$'
    and (g.data->>p_field)::bigint > 0
    and (coalesce(p_scope, 'world') = 'world'
         or g.user_id in (select s.user_id from public.scope_users(p_scope) s))
  order by (g.data->>p_field)::bigint desc, g.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- Своё место — тоже в выбранном охвате: «14-й в мире» и «2-й среди друзей»
-- отвечают на разные вопросы, и оба нужны рядом с соответствующей доской.
drop function if exists public.my_rank(text, public.leaderboard_mode);
create function public.my_rank(
  p_game_slug text,
  p_mode public.leaderboard_mode,
  p_scope text default 'world'
)
returns table (rank int, score bigint, total int)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select user_id,
           score,
           row_number() over (order by score desc, updated_at asc)::int as rank,
           count(*) over ()::int as total
      from public.leaderboard
     where game_slug = p_game_slug and mode = p_mode
       and (coalesce(p_scope, 'world') = 'world'
            or user_id in (select s.user_id from public.scope_users(p_scope) s))
  )
  select rank, score, total from ranked where user_id = (select auth.uid());
$$;

drop function if exists public.my_stat_rank(text, text);
create function public.my_stat_rank(
  p_game_slug text,
  p_field text,
  p_scope text default 'world'
)
returns table (rank int, value bigint, total int)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select g.user_id,
           (g.data->>p_field)::bigint as value,
           row_number() over (order by (g.data->>p_field)::bigint desc, g.updated_at asc)::int as rank,
           count(*) over ()::int as total
      from public.game_stats g
     where g.game_slug = p_game_slug
       and p_field in ('levels','stars','crystals','coins','ach','logs','bosses',
                       'secrets','worlds','rainbow','perfect','streak','playtime',
                       'score','hardcore','jumps','stompKills','blasterKills',
                       'burnKills','freezeKills')
       and (g.data->>p_field) ~ '^[0-9]+$'
       and (g.data->>p_field)::bigint > 0
       and (coalesce(p_scope, 'world') = 'world'
            or g.user_id in (select s.user_id from public.scope_users(p_scope) s))
  )
  select rank, value, total from ranked where user_id = (select auth.uid());
$$;

revoke execute on function public.my_rank(text, public.leaderboard_mode, text) from public, anon;
revoke execute on function public.my_stat_rank(text, text, text) from public, anon;
grant execute on function public.top_scores(text, public.leaderboard_mode, int, text) to anon, authenticated;
grant execute on function public.top_stats(text, text, int, text) to anon, authenticated;
grant execute on function public.my_rank(text, public.leaderboard_mode, text) to authenticated;
grant execute on function public.my_stat_rank(text, text, text) to authenticated;

-- ═══ 2. Уровень дня ═══════════════════════════════════════════════════════
-- Слоты названы по смыслу, а не «1..5»: в коде игры и в таблице должно быть
-- видно, о каком испытании речь.
create type public.daily_slot as enum ('easy', 'normal', 'hard', 'random', 'mutator');

create table public.daily_scores (
  user_id     uuid not null references auth.users(id) on delete cascade,
  game_slug   text not null references public.games(slug),
  day         date not null,
  slot        public.daily_slot not null,
  score       bigint not null check (score >= 0 and score <= 100000000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, game_slug, day, slot)
);

create index daily_scores_top_idx
  on public.daily_scores (game_slug, day, slot, score desc, updated_at asc);

alter table public.daily_scores enable row level security;

create policy "daily scores are public" on public.daily_scores
  for select using (true);
-- Пишет только submit_daily ниже: правило «только вверх» и проверка лицензии
-- живут там.

-- Сегодня по UTC — одна дата на всю планету, иначе таблица распадается на
-- часовые пояса.
create or replace function public.daily_today()
returns date
language sql
stable
set search_path = public
as $$ select (now() at time zone 'utc')::date; $$;

grant execute on function public.daily_today() to anon, authenticated;

create function public.submit_daily(
  p_game_slug text,
  p_slot public.daily_slot,
  p_score bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_day  date := public.daily_today();
  v_best bigint;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  perform public.assert_not_banned();
  if p_score is null or p_score < 0 or p_score > 100000000 then
    raise exception 'bad_score';
  end if;
  -- Уровень дня — часть купленной игры, а не витрина: без лицензии результат
  -- в таблицу не идёт (сыграть демо-сборке всё равно нечем — см. клиент).
  if not exists (
    select 1 from public.licenses
     where user_id = v_user and game_slug = p_game_slug and revoked_at is null
  ) then raise exception 'no_license'; end if;

  insert into public.daily_scores (user_id, game_slug, day, slot, score)
  values (v_user, p_game_slug, v_day, p_slot, p_score)
  on conflict (user_id, game_slug, day, slot) do update
    set score = greatest(public.daily_scores.score, excluded.score),
        updated_at = case
          when excluded.score > public.daily_scores.score then now()
          else public.daily_scores.updated_at
        end;

  select score into v_best from public.daily_scores
   where user_id = v_user and game_slug = p_game_slug and day = v_day and slot = p_slot;
  return v_best;
end;
$$;

-- Верхушка слота за сегодня. Охват — тот же, что у обычных досок.
create function public.daily_top(
  p_game_slug text,
  p_slot public.daily_slot,
  p_limit int default 50,
  p_scope text default 'world'
)
returns table (
  rank int,
  user_id uuid,
  nickname text,
  avatar_url text,
  score bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    row_number() over (order by d.score desc, d.updated_at asc)::int,
    d.user_id,
    p.nickname,
    p.avatar_url,
    d.score,
    d.updated_at
  from public.daily_scores d
  join public.profiles p on p.id = d.user_id
  where d.game_slug = p_game_slug
    and d.slot = p_slot
    and d.day = public.daily_today()
    and (coalesce(p_scope, 'world') = 'world'
         or d.user_id in (select s.user_id from public.scope_users(p_scope) s))
  order by d.score desc, d.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- Все пять слотов одним запросом: экран показывает их сеткой, и пять запросов
-- ради пяти чисел были бы расточительством.
create function public.my_daily(p_game_slug text, p_scope text default 'world')
returns table (slot public.daily_slot, score bigint, rank int, total int)
language sql
stable
security definer
set search_path = public
as $$
  with pool as (
    select d.*
      from public.daily_scores d
     where d.game_slug = p_game_slug
       and d.day = public.daily_today()
       and (coalesce(p_scope, 'world') = 'world'
            or d.user_id in (select s.user_id from public.scope_users(p_scope) s))
  ), ranked as (
    select user_id, slot, score,
           row_number() over (partition by slot order by score desc, updated_at asc)::int as rank,
           count(*) over (partition by slot)::int as total
      from pool
  )
  select slot, score, rank, total from ranked where user_id = (select auth.uid());
$$;

-- Сколько человек уже сыграло каждый слот — строка «сегодня сыграли N».
create function public.daily_counts(p_game_slug text)
returns table (slot public.daily_slot, players int)
language sql
stable
security definer
set search_path = public
as $$
  select slot, count(*)::int
    from public.daily_scores
   where game_slug = p_game_slug and day = public.daily_today()
   group by slot;
$$;

revoke execute on function public.submit_daily(text, public.daily_slot, bigint) from public, anon;
revoke execute on function public.my_daily(text, text) from public, anon;
grant execute on function public.submit_daily(text, public.daily_slot, bigint) to authenticated;
grant execute on function public.daily_top(text, public.daily_slot, int, text) to anon, authenticated;
grant execute on function public.my_daily(text, text) to authenticated;
grant execute on function public.daily_counts(text) to anon, authenticated;

-- ═══ 3. Призраки забегов ══════════════════════════════════════════════════
-- Одна запись на уровень — та, с которой поставлен рекорд. История чужих
-- забегов никому не нужна, а место занимала бы бесконечно.
create table public.ghost_runs (
  id          uuid primary key default gen_random_uuid(),
  game_slug   text not null references public.games(slug),
  kind        text not null check (kind in ('level', 'daily')),
  level       int  check (level is null or (level >= 1 and level <= 200)),
  hardcore    boolean not null default false,
  day         date,
  slot        public.daily_slot,
  user_id     uuid not null references auth.users(id) on delete cascade,
  score       bigint not null check (score >= 0 and score <= 100000000),
  frames      int not null check (frames > 0 and frames <= 200000),
  -- Запись нажатий в текстовом виде. 48 КБ — с запасом: кодируются не кадры, а
  -- моменты, когда кнопки меняются, и обычный уровень укладывается в единицы
  -- килобайт. Потолок нужен, чтобы одна запись не унесла всю квоту базы.
  data        text not null check (length(data) <= 49152),
  created_at  timestamptz not null default now(),
  check (
    (kind = 'level' and level is not null and day is null and slot is null) or
    (kind = 'daily' and day is not null and slot is not null and level is null)
  )
);

-- Рекордная запись на уровень: кампания и хардкор — разные строки.
create unique index ghost_level_uniq
  on public.ghost_runs (game_slug, level, hardcore) where kind = 'level';
create unique index ghost_daily_uniq
  on public.ghost_runs (game_slug, day, slot) where kind = 'daily';

alter table public.ghost_runs enable row level security;

create policy "ghosts are public" on public.ghost_runs
  for select using (true);

create function public.submit_ghost(
  p_game_slug text,
  p_kind text,
  p_score bigint,
  p_frames int,
  p_data text,
  p_level int default null,
  p_hardcore boolean default false,
  p_slot public.daily_slot default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_day  date := public.daily_today();
  v_old  bigint;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  perform public.assert_not_banned();
  if p_data is null or length(p_data) > 49152 then raise exception 'ghost_too_big'; end if;
  if p_kind not in ('level', 'daily') then raise exception 'bad_ghost_kind'; end if;

  if p_kind = 'level' then
    select score into v_old from public.ghost_runs
     where game_slug = p_game_slug and kind = 'level'
       and level = p_level and hardcore = coalesce(p_hardcore, false);
    -- Запись меняется только вместе с рекордом. Равный счёт прежнюю не
    -- вытесняет: перезаписывать её ради того же числа незачем.
    if v_old is not null and v_old >= p_score then return false; end if;

    delete from public.ghost_runs
     where game_slug = p_game_slug and kind = 'level'
       and level = p_level and hardcore = coalesce(p_hardcore, false);
    insert into public.ghost_runs (game_slug, kind, level, hardcore, user_id, score, frames, data)
    values (p_game_slug, 'level', p_level, coalesce(p_hardcore, false), v_user, p_score, p_frames, p_data);
  else
    select score into v_old from public.ghost_runs
     where game_slug = p_game_slug and kind = 'daily' and day = v_day and slot = p_slot;
    if v_old is not null and v_old >= p_score then return false; end if;

    delete from public.ghost_runs
     where game_slug = p_game_slug and kind = 'daily' and day = v_day and slot = p_slot;
    insert into public.ghost_runs (game_slug, kind, day, slot, user_id, score, frames, data)
    values (p_game_slug, 'daily', v_day, p_slot, v_user, p_score, p_frames, p_data);
  end if;
  return true;
end;
$$;

create function public.get_ghost(
  p_game_slug text,
  p_kind text,
  p_level int default null,
  p_hardcore boolean default false,
  p_slot public.daily_slot default null
)
returns table (nickname text, score bigint, frames int, data text)
language sql
stable
security definer
set search_path = public
as $$
  select p.nickname, g.score, g.frames, g.data
    from public.ghost_runs g
    join public.profiles p on p.id = g.user_id
   where g.game_slug = p_game_slug
     and g.kind = p_kind
     and (p_kind <> 'level' or (g.level = p_level and g.hardcore = coalesce(p_hardcore, false)))
     and (p_kind <> 'daily' or (g.day = public.daily_today() and g.slot = p_slot))
   limit 1;
$$;

-- Вчерашние записи уровня дня держать незачем: уровень уже не сыграть.
create function public.ghosts_sweep()
returns int
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.ghost_runs
     where kind = 'daily' and day < public.daily_today() - 1
    returning 1
  ) select count(*)::int from gone;
$$;

revoke execute on function public.submit_ghost(text, text, bigint, int, text, int, boolean, public.daily_slot) from public, anon;
revoke execute on function public.ghosts_sweep() from public, anon;
grant execute on function public.submit_ghost(text, text, bigint, int, text, int, boolean, public.daily_slot) to authenticated;
grant execute on function public.get_ghost(text, text, int, boolean, public.daily_slot) to anon, authenticated;
grant execute on function public.ghosts_sweep() to authenticated;

-- ═══ 4. Присутствие ═══════════════════════════════════════════════════════
-- Одна строка на игрока: «когда его видели в последний раз». История онлайна
-- не нужна — нужен ответ на вопрос «сколько сейчас играет».
create table public.presence (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  game_slug  text not null references public.games(slug),
  mode       text,
  last_seen  timestamptz not null default now()
);

create index presence_seen_idx on public.presence (game_slug, last_seen desc);

alter table public.presence enable row level security;
-- Наружу отдаются только счётчики (функции ниже), поэтому политик select для
-- клиента нет: кто именно сейчас в игре — не публичное дело.

create function public.presence_ping(p_game_slug text, p_mode text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then return; end if;   -- гость просто не считается
  insert into public.presence (user_id, game_slug, mode, last_seen)
  values (v_user, p_game_slug, left(coalesce(p_mode, ''), 24), now())
  on conflict (user_id) do update
    set game_slug = excluded.game_slug,
        mode = excluded.mode,
        last_seen = now();
end;
$$;

-- «Сейчас» — две минуты: игра отмечается раз в полминуты, и одна пропущенная
-- отметка не должна выкидывать игрока из счётчика.
create function public.presence_count(p_game_slug text)
returns table (online int, day int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.presence
      where game_slug = p_game_slug and last_seen > now() - interval '2 minutes'),
    (select count(*)::int from public.presence
      where game_slug = p_game_slug and last_seen > now() - interval '24 hours');
$$;

revoke execute on function public.presence_ping(text, text) from public, anon;
grant execute on function public.presence_ping(text, text) to authenticated;
grant execute on function public.presence_count(text) to anon, authenticated;

-- ═══ 5. Поиск игроков ═════════════════════════════════════════════════════
-- Ник — публичное имя: по нему игрока и находят в профиле, в друзьях и в
-- админке. Поиск отдаёт только то, что и так видно на странице профиля.
create index if not exists profiles_nickname_lower_idx
  on public.profiles (lower(nickname) text_pattern_ops);

create function public.search_players(p_query text, p_limit int default 10)
returns table (id uuid, nickname text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nickname, p.avatar_url
    from public.profiles p
   where length(coalesce(p_query, '')) >= 2
     and p.nickname ilike '%' || p_query || '%'
   -- Совпадение с начала ника важнее совпадения в середине: набирая «neko»,
   -- человек ищет nekoSan, а не «shadowneko».
   order by (lower(p.nickname) like lower(p_query) || '%') desc, length(p.nickname), p.nickname
   limit greatest(1, least(coalesce(p_limit, 10), 25));
$$;

grant execute on function public.search_players(text, int) to anon, authenticated;
