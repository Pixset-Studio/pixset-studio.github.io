-- Pixset Studio: друзья и публичный прогресс в играх.
--
-- Две вещи, которых не хватало аккаунту, чтобы быть аккаунтом, а не квитанцией
-- о покупке: с кем ты играешь и что у тебя получилось.
--
--   friendships — заявки и подтверждённая дружба;
--   game_stats  — короткая сводка прогресса, которую публикует сама игра.
--
-- Применить: Supabase → SQL Editor → выполнить целиком. Файл идемпотентен
-- настолько, насколько это возможно без DROP: повторный запуск упадёт на
-- существующих объектах, и это правильнее, чем молча их перетереть.

-- ── Дружба ────────────────────────────────────────────────────────────────
-- Одна строка на пару. Кто позвал — requester, кого позвали — addressee;
-- подтверждает только addressee. Пара хранится один раз, поэтому «А добавил Б»
-- и «Б добавил А» не могут разъехаться в две независимые записи.
create type public.friend_status as enum ('pending', 'accepted');

create table public.friendships (
  requester   uuid not null references auth.users(id) on delete cascade,
  addressee   uuid not null references auth.users(id) on delete cascade,
  status      public.friend_status not null default 'pending',
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  primary key (requester, addressee),
  constraint no_self_friend check (requester <> addressee)
);

-- Поиск «все мои связи» идёт с обеих сторон.
create index friendships_addressee_idx on public.friendships (addressee, status);

alter table public.friendships enable row level security;

-- Видно только свои связи — и как позвавшему, и как позванному.
create policy "own friendships" on public.friendships
  for select using (
    (select auth.uid()) = requester or (select auth.uid()) = addressee
  );
-- Записи создаёт и удаляет клиент, но подтверждение идёт только через RPC:
-- иначе позвавший мог бы сам себе поставить accepted.
create policy "create own request" on public.friendships
  for insert with check ((select auth.uid()) = requester and status = 'pending');
create policy "delete own link" on public.friendships
  for delete using (
    (select auth.uid()) = requester or (select auth.uid()) = addressee
  );

-- ── Прогресс в играх ──────────────────────────────────────────────────────
-- Короткая сводка, которую игра публикует сама: пройдено уровней, звёзды,
-- достижения, наигранное время. Не сохранение — сохранение лежит в cloud_saves
-- и приватно. Это витрина, её видно всем: на неё смотрят друзья.
create table public.game_stats (
  user_id     uuid not null references auth.users(id) on delete cascade,
  game_slug   text not null references public.games(slug),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, game_slug)
);

create index game_stats_game_idx on public.game_stats (game_slug, updated_at desc);

alter table public.game_stats enable row level security;

create policy "stats are public" on public.game_stats
  for select using (true);
create policy "own stats upsert" on public.game_stats
  for insert with check ((select auth.uid()) = user_id);
create policy "own stats update" on public.game_stats
  for update using ((select auth.uid()) = user_id);

-- ── Поиск игроков ─────────────────────────────────────────────────────────
-- Профили и так открыты на чтение (лидерборды, мультиплеер), но отдавать их
-- целиком поиску незачем: функция возвращает ровно то, что нужно карточке.
create function public.search_players(p_query text)
returns table (id uuid, nickname text, avatar_url text)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id, p.nickname, p.avatar_url
  from public.profiles p
  where p.id <> (select auth.uid())
    and p.nickname ilike p_query || '%'
  order by length(p.nickname), p.nickname
  limit 20;
$$;

-- ── Заявка в друзья ───────────────────────────────────────────────────────
-- По нику, а не по id: игрок знает ник, а не UUID. Встречная заявка сразу
-- превращается в дружбу — иначе двое, добавившие друг друга, застряли бы
-- каждый в своём «ожидании».
create function public.friend_request(p_nickname text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := (select auth.uid());
  target uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;

  select id into target from public.profiles where nickname = p_nickname;
  if target is null then raise exception 'player_not_found'; end if;
  if target = me then raise exception 'cannot_add_self'; end if;

  -- Встречная заявка: подтверждаем её вместо создания второй.
  update public.friendships
     set status = 'accepted', decided_at = now()
   where requester = target and addressee = me and status = 'pending';
  if found then return 'accepted'; end if;

  insert into public.friendships (requester, addressee)
  values (me, target)
  on conflict (requester, addressee) do nothing;

  return 'pending';
end;
$$;

-- ── Подтверждение ─────────────────────────────────────────────────────────
-- Только тот, кого позвали. Через RPC, а не через политику UPDATE: политика
-- пропустила бы и «сам подтвердил свою же заявку».
create function public.friend_accept(p_requester uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not_authenticated'; end if;

  update public.friendships
     set status = 'accepted', decided_at = now()
   where requester = p_requester and addressee = me and status = 'pending';

  if not found then raise exception 'request_not_found'; end if;
end;
$$;

-- ── Список друзей и заявок ────────────────────────────────────────────────
-- Одним запросом, уже «расплющенный»: клиенту не нужно знать, с какой стороны
-- пары он оказался.
--   friend   — подтверждённая дружба
--   incoming — нас позвали, ждём нашего решения
--   outgoing — мы позвали, ждём чужого
create view public.my_friends
with (security_invoker = true) as
  select
    case when f.requester = (select auth.uid()) then f.addressee else f.requester end as id,
    p.nickname,
    p.avatar_url,
    case
      when f.status = 'accepted' then 'friend'
      when f.addressee = (select auth.uid()) then 'incoming'
      else 'outgoing'
    end as kind,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester = (select auth.uid()) then f.addressee else f.requester end
  where f.requester = (select auth.uid()) or f.addressee = (select auth.uid());

-- ── Публикация прогресса ──────────────────────────────────────────────────
-- Игра зовёт после сохранения. Отдельная функция, а не upsert с клиента:
-- так строка всегда принадлежит вызывающему и всегда обновляет отметку времени.
create function public.publish_game_stats(p_game_slug text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := (select auth.uid());
begin
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
end;
$$;

-- ── Публичный профиль ─────────────────────────────────────────────────────
-- Всё, что нужно чужой карточке: кто это, с какого года и что у него в играх.
create function public.public_profile(p_nickname text)
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

revoke execute on function public.friend_request(text)  from anon;
revoke execute on function public.friend_accept(uuid)   from anon;
revoke execute on function public.publish_game_stats(text, jsonb) from anon;
