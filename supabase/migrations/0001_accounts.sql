-- Pixset Studio: аккаунты, каталог игр, лицензии, устройства, заказы.
-- Авторизация живёт в auth.users (Supabase Auth), здесь только доменные данные.

-- ── Профили ───────────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text unique not null,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Профиль создаётся автоматически при регистрации.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nickname', ''),
      'player_' || substr(new.id::text, 1, 8)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Функция нужна только триггеру, снаружи её звать незачем.
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- ── Каталог игр ───────────────────────────────────────────────────────────
create table public.games (
  slug          text primary key,          -- 'byte-blaster', 'hearthhold'
  title         text not null,
  tagline       text,
  cover_url     text,
  price_rub     integer,                   -- в копейках, null = ещё не продаётся
  price_usd     integer,                   -- в центах
  is_published  boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ── Заказы ────────────────────────────────────────────────────────────────
create type public.order_status as enum ('pending', 'paid', 'failed', 'refunded');

create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  game_slug     text not null references public.games(slug),
  provider      text not null,             -- 'yookassa', 'lava', 'manual'
  provider_ref  text,                      -- id платежа на стороне провайдера
  amount        integer not null,
  currency      text not null default 'RUB',
  status        public.order_status not null default 'pending',
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);

create index orders_user_idx on public.orders (user_id, created_at desc);
create unique index orders_provider_ref_idx
  on public.orders (provider, provider_ref)
  where provider_ref is not null;

-- ── Лицензии ──────────────────────────────────────────────────────────────
-- Одна лицензия = право на игру навсегда, на всех устройствах аккаунта.
create table public.licenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  game_slug   text not null references public.games(slug),
  order_id    uuid references public.orders(id),
  source      text not null default 'purchase',  -- purchase | gift | manual | press
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,                       -- не null = отозвана (возврат, фрод)
  unique (user_id, game_slug)
);

create index licenses_user_idx on public.licenses (user_id);

-- ── Устройства ────────────────────────────────────────────────────────────
-- Учёт активаций. Лимит не жёсткий — нужен для статистики и защиты от
-- массового расшаривания одного аккаунта.
create table public.devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  device_hash  text not null,              -- анонимный отпечаток, не железные id
  platform     text,                       -- windows | android | web
  label        text,                       -- то, что видит игрок в профиле
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  unique (user_id, device_hash)
);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.profiles  enable row level security;
alter table public.games     enable row level security;
alter table public.orders    enable row level security;
alter table public.licenses  enable row level security;
alter table public.devices   enable row level security;

-- Профиль: свой читаем и правим; чужие ники видны всем (лидерборды, мультиплеер).
create policy "profiles are public" on public.profiles
  for select using (true);
create policy "own profile update" on public.profiles
  for update using ((select auth.uid()) = id);

-- Каталог: опубликованные игры видны всем, включая гостей.
create policy "published games are public" on public.games
  for select using (is_published);

-- Заказы и лицензии: только свои, только на чтение.
-- Запись идёт исключительно с сервера (service_role), чтобы клиент
-- не мог выдать лицензию сам себе.
create policy "own orders" on public.orders
  for select using ((select auth.uid()) = user_id);
create policy "own licenses" on public.licenses
  for select using ((select auth.uid()) = user_id);

-- Устройства: игрок видит свои и может отвязать лишние.
create policy "own devices" on public.devices
  for select using ((select auth.uid()) = user_id);
create policy "own devices delete" on public.devices
  for delete using ((select auth.uid()) = user_id);

-- ── Права игрока: то, что читает игра ─────────────────────────────────────
create view public.my_entitlements
with (security_invoker = true) as
  select game_slug, granted_at
  from public.licenses
  where user_id = (select auth.uid())
    and revoked_at is null;

-- ── Стартовый каталог ─────────────────────────────────────────────────────
insert into public.games (slug, title, tagline, is_published) values
  ('byte-blaster', 'Byte Blaster', 'Взломай сеть GRID', true),
  ('hearthhold',   'Hearthhold',   'Симулятор средневекового поселения', false);
