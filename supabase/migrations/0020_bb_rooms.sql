-- Byte Blaster: комнаты мультиплеера переезжают в базу студии.
--
-- Зачем. Сервер комнат живёт на Railway, а подсеть Railway в России режут на
-- уровне пакетов: TCP до сервера доходит, TLS-приветствие обрывают. Смена
-- домена не помогла — фильтр смотрит на адрес, а не на имя. Supabase из России
-- открывается (на нём уже работают аккаунты, рекорды и облачные сохранения),
-- поэтому игра получает второй канал связи: пересылку берёт на себя Supabase
-- Realtime, а всё, что раньше знал сервер про комнаты — эта таблица.
--
-- Что здесь есть, а чего нет. Здесь только «вывеска» комнаты: код, кто хозяин,
-- сколько игроков, началась ли игра. Сами пакеты игры через базу НЕ идут —
-- они летят через Realtime мимо Postgres. Состав комнаты тоже не здесь: его
-- знает presence того же Realtime-канала. Строка нужна ради двух вещей —
-- списка публичных комнат и проверки кода при входе.
--
-- Живучесть. Хозяин комнаты раз в 15 секунд обновляет строку (bb_room_beat).
-- Комната считается живой 45 секунд с последнего обновления: закрыл игру —
-- через полминуты комната пропала из списка сама, даже если корректного
-- «выхода» не было. Совсем старые строки удаляются при первом же обращении.
--
-- Применить: Supabase → SQL Editor → выполнить целиком.

-- ── Таблица ──────────────────────────────────────────────────────────────────

create table if not exists public.bb_rooms (
  code         text primary key,
  game_slug    text        not null default 'byte-blaster',
  host_id      text        not null,
  host_name    text        not null default '?',
  is_public    boolean     not null default true,
  max_players  smallint    not null default 5,
  player_count smallint    not null default 1,
  in_game      boolean     not null default false,
  mode         text,
  level        int,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists bb_rooms_live_idx
  on public.bb_rooms (is_public, in_game, updated_at desc);

-- Снаружи таблица закрыта наглухо: политик нет, и это намеренно. Всё общение
-- идёт через функции ниже — иначе кто угодно с публичным ключом мог бы залить
-- в список тысячу выдуманных комнат или переписать чужую.
alter table public.bb_rooms enable row level security;

-- ── Уборка ───────────────────────────────────────────────────────────────────
-- Отдельного планировщика нет и не нужно: строк мало, а чистку делает любое
-- обращение к списку или создание комнаты.

create or replace function public.bb_rooms_sweep()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.bb_rooms where updated_at < now() - interval '3 minutes';
$$;

-- ── Открыть комнату ──────────────────────────────────────────────────────────
-- Код придумывает игра (шесть символов без похожих букв). Занят живой
-- комнатой — возвращаем false, и клиент берёт другой код.

create or replace function public.bb_room_open(
  p_code      text,
  p_host_id   text,
  p_host_name text,
  p_public    boolean default true,
  p_max       int     default 5
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.bb_rooms where updated_at < now() - interval '3 minutes';

  if exists (select 1 from public.bb_rooms where code = upper(p_code)) then
    return false;
  end if;

  insert into public.bb_rooms (code, host_id, host_name, is_public, max_players, player_count)
  values (
    upper(p_code),
    left(coalesce(p_host_id, ''), 40),
    left(coalesce(nullif(trim(p_host_name), ''), '?'), 24),
    coalesce(p_public, true),
    greatest(2, least(5, coalesce(p_max, 5))),
    1
  );
  return true;
end;
$$;

-- ── Сердцебиение ─────────────────────────────────────────────────────────────
-- Хозяин комнаты повторяет его раз в 15 секунд. Заодно им же чинится комната,
-- которую успела снести уборка: вставляем строку заново, а не молчим.
-- Хозяин мог смениться (прежний вышел) — новый пишет своё имя и id.

create or replace function public.bb_room_beat(
  p_code      text,
  p_host_id   text,
  p_host_name text,
  p_count     int,
  p_in_game   boolean default false,
  p_mode      text    default null,
  p_level     int     default null,
  p_public    boolean default true,
  p_max       int     default 5
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.bb_rooms (
    code, host_id, host_name, is_public, max_players,
    player_count, in_game, mode, level, updated_at
  )
  values (
    upper(p_code),
    left(coalesce(p_host_id, ''), 40),
    left(coalesce(nullif(trim(p_host_name), ''), '?'), 24),
    coalesce(p_public, true),
    greatest(2, least(5, coalesce(p_max, 5))),
    greatest(0, least(5, coalesce(p_count, 1))),
    coalesce(p_in_game, false),
    left(coalesce(p_mode, ''), 16),
    p_level,
    now()
  )
  on conflict (code) do update set
    host_id      = excluded.host_id,
    host_name    = excluded.host_name,
    is_public    = excluded.is_public,
    max_players  = excluded.max_players,
    player_count = excluded.player_count,
    in_game      = excluded.in_game,
    mode         = excluded.mode,
    level        = excluded.level,
    updated_at   = now();
$$;

-- ── Узнать про комнату (вход по коду) ────────────────────────────────────────
-- Отдаём только то, что нужно клиенту решить «пускают ли меня»: свежая ли
-- комната, есть ли место, не началась ли игра.

create or replace function public.bb_room_info(p_code text)
returns table (
  code         text,
  host_id      text,
  host_name    text,
  is_public    boolean,
  max_players  smallint,
  player_count smallint,
  in_game      boolean
)
language sql
security definer
set search_path = public
as $$
  select r.code, r.host_id, r.host_name, r.is_public,
         r.max_players, r.player_count, r.in_game
    from public.bb_rooms r
   where r.code = upper(p_code)
     and r.updated_at > now() - interval '45 seconds';
$$;

-- ── Список публичных комнат ──────────────────────────────────────────────────
-- Ровно те же правила, что были на релее: только открытые, только с местами,
-- только те, где игра ещё не началась.

create or replace function public.bb_rooms_list(p_limit int default 30)
returns table (
  code         text,
  host_name    text,
  player_count smallint,
  max_players  smallint,
  mode         text,
  level        int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.bb_rooms where updated_at < now() - interval '3 minutes';

  return query
    select r.code, r.host_name, r.player_count, r.max_players,
           nullif(r.mode, '') as mode, r.level
      from public.bb_rooms r
     where r.is_public
       and not r.in_game
       and r.player_count > 0
       and r.player_count < r.max_players
       and r.updated_at > now() - interval '45 seconds'
     order by r.updated_at desc
     limit greatest(1, least(100, coalesce(p_limit, 30)));
end;
$$;

-- ── Сводка для страниц «Онлайн» и «Состояние серверов» ───────────────────────
-- Раньше эти плитки спрашивали сам релей по HTTP — и у тех, кому релей
-- недоступен, вечно стоял прочерк. Теперь счёт есть всегда: комнаты и так
-- отмечаются в базе.

create or replace function public.bb_rooms_stats()
returns table (rooms int, players int)
language sql
security definer
set search_path = public
as $$
  select coalesce(count(*), 0)::int,
         coalesce(sum(r.player_count), 0)::int
    from public.bb_rooms r
   where r.updated_at > now() - interval '45 seconds'
     and r.player_count > 0;
$$;

-- ── Закрыть комнату ──────────────────────────────────────────────────────────
-- Явный выход последнего игрока. Не дождались — уборка сделает то же самое,
-- просто на минуту позже.

create or replace function public.bb_room_close(p_code text, p_host_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.bb_rooms
   where code = upper(p_code)
     and host_id = left(coalesce(p_host_id, ''), 40);
$$;

-- ── Права ────────────────────────────────────────────────────────────────────
-- Мультиплеер работает и без входа в аккаунт, поэтому функции открыты anon.
-- Уборка — служебная, снаружи не зовётся.

revoke execute on function public.bb_rooms_sweep() from public, anon;

grant execute on function public.bb_room_open(text, text, text, boolean, int) to anon, authenticated;
grant execute on function public.bb_room_beat(text, text, text, int, boolean, text, int, boolean, int) to anon, authenticated;
grant execute on function public.bb_room_info(text) to anon, authenticated;
grant execute on function public.bb_rooms_list(int) to anon, authenticated;
grant execute on function public.bb_rooms_stats() to anon, authenticated;
grant execute on function public.bb_room_close(text, text) to anon, authenticated;
