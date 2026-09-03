-- Pixset Studio: таблицы рекордов.
--
-- Витрина прогресса (game_stats) отвечает на вопрос «как у меня дела», а эта
-- таблица — на вопрос «а как у других». Разные вопросы и разная форма данных:
-- там свободный jsonb на игрока, здесь одно число на режим, по которому нужно
-- быстро строить топ и искать своё место.
--
-- Применить: Supabase → SQL Editor → выполнить целиком. Как и остальные файлы
-- миграций, повторный запуск упадёт на существующих объектах — это правильнее,
-- чем молча перетереть чужие данные.
--
-- ЧЕСТНОЕ ОГРАНИЧЕНИЕ. Счёт присылает сам клиент, и проверить его сервер не
-- может: игра целиком локальная, симулировать её прохождение на бэкенде негде.
-- Поэтому здесь стоит только то, что реально помогает: результат принимается
-- лишь если он ВЫШЕ предыдущего, значение ограничено сверху разумным потолком,
-- и одна запись на игрока и режим. От случайной глупости это защищает, от
-- целенаправленной подделки — нет, и городить видимость защиты не стоит.

-- ── Режимы ────────────────────────────────────────────────────────────────
-- Отдельный тип, а не свободный text: опечатка в названии режима иначе
-- завела бы отдельную «таблицу рекордов» с одним игроком в ней.
create type public.leaderboard_mode as enum ('adventure', 'endless', 'hardcore');

-- ── Рекорды ───────────────────────────────────────────────────────────────
create table public.leaderboard (
  user_id     uuid not null references auth.users(id) on delete cascade,
  game_slug   text not null references public.games(slug),
  mode        public.leaderboard_mode not null,
  score       bigint not null check (score >= 0 and score <= 100000000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, game_slug, mode)
);

-- Индекс под главный запрос: топ режима по убыванию счёта.
create index leaderboard_top_idx
  on public.leaderboard (game_slug, mode, score desc, updated_at asc);

alter table public.leaderboard enable row level security;

-- Читать может кто угодно: это и есть смысл таблицы рекордов.
create policy "leaderboard is public" on public.leaderboard
  for select using (true);
-- Писать — только через RPC ниже (правило «только вверх» живёт там),
-- поэтому прямых insert/update политик для клиента здесь намеренно нет.

-- ── Отправка результата ───────────────────────────────────────────────────
-- Возвращает актуальный (то есть лучший) счёт игрока в этом режиме — клиенту
-- удобно сразу показать, засчиталось или его прошлый результат был выше.
create function public.submit_score(
  p_game_slug text,
  p_mode public.leaderboard_mode,
  p_score bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_best bigint;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_score is null or p_score < 0 or p_score > 100000000 then
    raise exception 'bad_score';
  end if;

  insert into public.leaderboard (user_id, game_slug, mode, score)
  values (v_user, p_game_slug, p_mode, p_score)
  on conflict (user_id, game_slug, mode) do update
    -- Только вверх: повторное прохождение с худшим результатом не должно
    -- стирать рекорд, а игра шлёт сводку после каждого сохранения.
    set score = greatest(public.leaderboard.score, excluded.score),
        updated_at = case
          when excluded.score > public.leaderboard.score then now()
          else public.leaderboard.updated_at
        end;

  select score into v_best
    from public.leaderboard
   where user_id = v_user and game_slug = p_game_slug and mode = p_mode;
  return v_best;
end;
$$;

-- ── Верхушка таблицы ──────────────────────────────────────────────────────
-- Ник и аватар джойним здесь, чтобы клиент не делал второй запрос на каждого
-- игрока в списке. При равном счёте выше тот, кто добрался туда раньше.
create function public.top_scores(
  p_game_slug text,
  p_mode public.leaderboard_mode,
  p_limit int default 50
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
  order by l.score desc, l.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- ── Своё место ────────────────────────────────────────────────────────────
-- Отдельной функцией, потому что игрок может быть далеко за пределами топа,
-- а показать ему своё место всё равно нужно — иначе таблица бесполезна всем,
-- кто не в первой полусотне.
create function public.my_rank(
  p_game_slug text,
  p_mode public.leaderboard_mode
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
  )
  select rank, score, total from ranked where user_id = auth.uid();
$$;

-- Postgres по умолчанию даёт EXECUTE роли PUBLIC, поэтому одного гранта
-- authenticated мало: без revoke аноним всё равно может позвать функцию.
-- top_scores открыта намеренно — таблицу рекордов видно и без входа.
revoke execute on function public.submit_score(text, public.leaderboard_mode, bigint) from public, anon;
revoke execute on function public.my_rank(text, public.leaderboard_mode) from public, anon;

grant execute on function public.submit_score(text, public.leaderboard_mode, bigint) to authenticated;
grant execute on function public.top_scores(text, public.leaderboard_mode, int) to anon, authenticated;
grant execute on function public.my_rank(text, public.leaderboard_mode) to authenticated;
