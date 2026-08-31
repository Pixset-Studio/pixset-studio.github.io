-- Pixset Studio: приглашения в комнату и объявления студии.
--
-- Оба механизма — один и тот же канал «серверу есть что тебе сказать», поэтому
-- лежат вместе и читаются игрой одним опросом:
--
--   room_invites  — друг зовёт в свою комнату; переход по уведомлению сразу
--                   заводит игрока в неё;
--   announcements — рассылка из админки на все устройства, где игра открыта.
--
-- Применить: Supabase → SQL Editor → выполнить целиком. Требует 0002_friends.sql
-- (проверка дружбы опирается на таблицу friendships).

-- ── Приглашение в комнату ─────────────────────────────────────────────────
create table public.room_invites (
  id          uuid primary key default gen_random_uuid(),
  from_user   uuid not null references auth.users(id) on delete cascade,
  to_user     uuid not null references auth.users(id) on delete cascade,
  game_slug   text not null references public.games(slug),
  room_code   text not null,
  -- Откуда комната: облачный relay или локальная сеть. Гость должен
  -- подключаться туда же, иначе код комнаты ничего не значит.
  source      text not null default 'server',
  created_at  timestamptz not null default now(),
  seen_at     timestamptz,
  constraint no_self_invite check (from_user <> to_user),
  constraint known_source check (source in ('server', 'local'))
);

create index room_invites_to_idx on public.room_invites (to_user, created_at desc);

alter table public.room_invites enable row level security;

-- Видно обеим сторонам: получателю — чтобы прийти, отправителю — чтобы понимать,
-- что приглашение ушло.
create policy "own invites" on public.room_invites
  for select using (
    (select auth.uid()) = to_user or (select auth.uid()) = from_user
  );
-- Отметку «увидел» ставит только получатель.
create policy "mark own invite seen" on public.room_invites
  for update using ((select auth.uid()) = to_user);
create policy "drop own invite" on public.room_invites
  for delete using (
    (select auth.uid()) = to_user or (select auth.uid()) = from_user
  );
-- Вставка идёт только через RPC ниже: там проверяется дружба.

-- ── Позвать друга в комнату ───────────────────────────────────────────────
-- По нику: игра знает ник соседа по списку друзей, а не его UUID. Звать можно
-- только друга — иначе код комнаты стал бы способом рассылать спам кому угодно.
create function public.invite_to_room(
  p_nickname text, p_game_slug text, p_room_code text, p_source text default 'server')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := (select auth.uid());
  target uuid;
  ok     boolean;
  fresh  uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_room_code is null or length(p_room_code) < 3 then raise exception 'bad_room'; end if;

  select id into target from public.profiles where nickname = p_nickname;
  if target is null then raise exception 'player_not_found'; end if;
  if target = me then raise exception 'cannot_add_self'; end if;

  select true into ok from public.friendships f
   where f.status = 'accepted'
     and ((f.requester = me and f.addressee = target)
       or (f.requester = target and f.addressee = me))
   limit 1;
  if ok is not true then raise exception 'not_friends'; end if;

  -- Не заваливаем одного и того же человека одной и той же комнатой: если
  -- приглашение уже висит непрочитанным, обновляем его время.
  update public.room_invites
     set created_at = now(), seen_at = null
   where to_user = target and from_user = me
     and game_slug = p_game_slug and room_code = p_room_code
     and seen_at is null
  returning id into fresh;
  if fresh is not null then return fresh; end if;

  insert into public.room_invites (from_user, to_user, game_slug, room_code, source)
  values (me, target, p_game_slug, p_room_code,
          case when p_source = 'local' then 'local' else 'server' end)
  returning id into fresh;

  return fresh;
end;
$$;

-- ── Что мне пришло ────────────────────────────────────────────────────────
-- Только свежее и непрочитанное: приглашение в комнату, которой уже нет,
-- хуже отсутствия приглашения. Десять минут — заведомо больше, чем живёт
-- лобби, и заведомо меньше, чем «вчерашнее».
create view public.my_room_invites
with (security_invoker = true) as
  select i.id, i.game_slug, i.room_code, i.source, i.created_at,
         p.nickname as from_nickname, p.avatar_url as from_avatar
  from public.room_invites i
  join public.profiles p on p.id = i.from_user
  where i.to_user = (select auth.uid())
    and i.seen_at is null
    and i.created_at > now() - interval '10 minutes'
  order by i.created_at desc;

-- ── Объявления студии ─────────────────────────────────────────────────────
-- Рассылка из админки. Читают все (в том числе не вошедшие), пишет только
-- администратор. Игра показывает их как уведомление на любом устройстве, где
-- она открыта и уведомления разрешены.
create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  game_slug   text references public.games(slug),   -- null = всем играм студии
  title       text not null,
  body        text,
  url         text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days')
);

create index announcements_live_idx on public.announcements (created_at desc);

alter table public.announcements enable row level security;

create policy "announcements are public" on public.announcements
  for select using (expires_at > now());

-- Права администратора берём из профиля, а не из клиента.
create policy "admins post announcements" on public.announcements
  for insert with check (
    exists (select 1 from public.profiles p
             where p.id = (select auth.uid()) and p.is_admin)
  );
create policy "admins remove announcements" on public.announcements
  for delete using (
    exists (select 1 from public.profiles p
             where p.id = (select auth.uid()) and p.is_admin)
  );

revoke execute on function public.invite_to_room(text, text, text, text) from anon;
