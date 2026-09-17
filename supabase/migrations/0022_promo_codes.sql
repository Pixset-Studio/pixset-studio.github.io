-- ═══════════════════════════════════════════════════════════════════════════
--  ПРОМОКОДЫ
-- ═══════════════════════════════════════════════════════════════════════════
-- Два разных зверя под одним словом «промокод»:
--
--   • СКИДКА  — уменьшает сумму заказа: процентом или фиксированной суммой.
--     Засчитывается не при вводе, а при ОПЛАТЕ: брошенные заказы иначе съедали
--     бы лимит использований, и код «на 10 человек» кончался бы за вечер.
--
--   • ЛИЦЕНЗИЯ — открывает игру сразу, без оплаты. Бывает постоянной и
--     временной (license_days): выдать прессе доступ на неделю — обычная
--     задача, а вечная лицензия за обзор не нужна никому.
--
-- Сами коды не читаются клиентом ВООБЩЕ: таблица закрыта RLS наглухо, вся
-- работа идёт через SECURITY DEFINER-функции. Иначе список действующих кодов
-- утёк бы первым же запросом к REST.

create type public.promo_kind as enum ('discount', 'license');

create table if not exists public.promo_codes (
  code            text primary key,
  kind            public.promo_kind not null,
  -- null = код действует на любую игру студии
  game_slug       text references public.games(slug) on delete cascade,

  -- Скидка. Ровно одно из двух полей, проверка ниже.
  percent_off     smallint,
  amount_off      integer,          -- в копейках/центах, в валюте заказа

  -- Лицензия. null в license_days = навсегда.
  license_days    integer,

  -- Ограничения
  max_uses        integer,          -- null = без общего лимита
  uses            integer not null default 0,
  per_user_limit  smallint not null default 1,
  starts_at       timestamptz,
  expires_at      timestamptz,
  active          boolean not null default true,

  note            text,             -- для чего выпущен: «блогеру», «распродажа»
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,

  -- Скидка 100% — это не скидка, а выдача игры: для неё есть kind='license'.
  -- Разрешать её здесь значило бы создавать заказ на ноль рублей, который
  -- платёжный сервис всё равно не примет.
  constraint promo_percent_range check (percent_off is null or (percent_off between 1 and 99)),
  constraint promo_amount_positive check (amount_off is null or amount_off > 0),
  constraint promo_days_positive   check (license_days is null or license_days > 0),
  constraint promo_uses_positive   check (max_uses is null or max_uses > 0),
  constraint promo_window          check (starts_at is null or expires_at is null or starts_at < expires_at),
  -- Скидка задаётся ровно одним способом; у лицензии скидочных полей нет.
  constraint promo_shape check (
    (kind = 'discount' and license_days is null
      and ((percent_off is not null) <> (amount_off is not null)))
    or
    (kind = 'license' and percent_off is null and amount_off is null)
  )
);

comment on table public.promo_codes is
  'Промокоды: скидка на заказ или выдача лицензии. Клиенту недоступны, только через RPC.';

create table if not exists public.promo_redemptions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null references public.promo_codes(code) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  order_id    uuid references public.orders(id) on delete set null,
  license_id  uuid references public.licenses(id) on delete set null,
  redeemed_at timestamptz not null default now()
);

create index if not exists promo_redemptions_user_idx on public.promo_redemptions (user_id, code);
create index if not exists promo_redemptions_code_idx on public.promo_redemptions (code);

-- ── Временные лицензии ─────────────────────────────────────────────────────
-- До сих пор лицензия была либо есть, либо отозвана. Срок нужен промокодам на
-- временный доступ; null, как и раньше, означает «навсегда».
alter table public.licenses add column if not exists expires_at timestamptz;
create index if not exists licenses_expires_idx on public.licenses (expires_at)
  where expires_at is not null;

-- Заказ помнит, каким кодом его удешевили: без этого при оплате непонятно,
-- чьё использование засчитывать.
alter table public.orders add column if not exists promo_code text
  references public.promo_codes(code) on delete set null;
alter table public.orders add column if not exists amount_full integer;

comment on column public.orders.amount_full is
  'Цена без скидки. amount — то, что игрок платит на самом деле.';

-- Истёкшая лицензия перестаёт быть лицензией. Представление читают и сайт, и
-- функция прав, поэтому фильтр должен жить здесь, а не в каждом вызывающем.
create or replace view public.my_entitlements as
  select game_slug, granted_at, expires_at
    from public.licenses
   where user_id = (select auth.uid())
     and revoked_at is null
     and (expires_at is null or expires_at > now());

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

-- Никаких политик на promo_codes: читать и писать может только владелец базы
-- и функции с SECURITY DEFINER. Это намеренно.

create policy promo_redemptions_own on public.promo_redemptions
  for select using (user_id = (select auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
--  Проверка кода
-- ═══════════════════════════════════════════════════════════════════════════
-- Возвращает строку причины отказа или null, если код годен. Вынесено
-- отдельно, потому что одно и то же нужно и предпросмотру, и погашению, и
-- создателю заказа — а расходиться этим проверкам нельзя.
create or replace function public._promo_check(
  p_code text, p_game_slug text, p_user uuid, out reason text, out rec public.promo_codes
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mine integer;
begin
  reason := null;
  select * into rec from public.promo_codes where code = upper(btrim(p_code));
  if not found then reason := 'not_found'; return; end if;

  if not rec.active then reason := 'inactive'; return; end if;
  if rec.starts_at is not null and now() < rec.starts_at then reason := 'not_started'; return; end if;
  if rec.expires_at is not null and now() > rec.expires_at then reason := 'expired'; return; end if;
  if rec.max_uses is not null and rec.uses >= rec.max_uses then reason := 'used_up'; return; end if;
  if rec.game_slug is not null and rec.game_slug is distinct from p_game_slug then
    reason := 'wrong_game'; return;
  end if;

  select count(*) into v_mine from public.promo_redemptions
   where code = rec.code and user_id = p_user;
  if v_mine >= rec.per_user_limit then reason := 'already_used'; return; end if;
end;
$$;

revoke execute on function public._promo_check(text, text, uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
--  Предпросмотр: что даст код, ничего не тратя
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.promo_preview(p_code text, p_game_slug text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user     uuid := auth.uid();
  v_reason   text;
  v_rec      public.promo_codes;
  v_currency text;
  v_game     public.games%rowtype;
  v_full     integer;
  v_final    integer;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  perform public.assert_not_banned();

  select reason, rec into v_reason, v_rec from public._promo_check(p_code, p_game_slug, v_user);
  if v_reason is not null then
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end if;

  if v_rec.kind = 'license' then
    return jsonb_build_object(
      'ok', true, 'kind', 'license',
      'days', v_rec.license_days,          -- null = навсегда
      'game', coalesce(v_rec.game_slug, p_game_slug));
  end if;

  select * into v_game from public.games where slug = p_game_slug and is_published;
  if not found then raise exception 'game_not_found'; end if;

  select currency into v_currency from public.profiles where id = v_user;
  v_currency := coalesce(v_currency, 'USD');
  v_full := case when v_currency = 'RUB' then v_game.price_rub else v_game.price_usd end;
  if v_full is null then raise exception 'price_not_set'; end if;

  v_final := public._promo_apply(v_rec, v_full);

  return jsonb_build_object(
    'ok', true, 'kind', 'discount',
    'currency', v_currency,
    'amount_full', v_full,
    'amount', v_final,
    'percent_off', v_rec.percent_off,
    'amount_off', v_rec.amount_off);
end;
$$;

-- Сколько останется заплатить. Отдельной функцией, чтобы предпросмотр и
-- создание заказа считали одинаково — расхождение здесь означало бы, что в
-- корзине одна цена, а списывается другая.
create or replace function public._promo_apply(p_rec public.promo_codes, p_full integer)
returns integer
language plpgsql
immutable
as $$
declare
  v integer;
begin
  if p_rec.percent_off is not null then
    v := p_full - (p_full * p_rec.percent_off) / 100;
  else
    v := p_full - p_rec.amount_off;
  end if;
  -- Ниже минимальной суммы платёжный сервис заказ не примет, а «ноль» — это
  -- уже не скидка, а выдача игры (для неё есть kind='license').
  if v < 100 then v := 100; end if;   -- 1 рубль / 1 доллар в копейках и центах
  return v;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Погашение кода-лицензии
-- ═══════════════════════════════════════════════════════════════════════════
-- Только для kind='license': скидка гасится не здесь, а при оплате заказа.
create or replace function public.promo_redeem(p_code text, p_game_slug text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user    uuid := auth.uid();
  v_reason  text;
  v_rec     public.promo_codes;
  v_game    text;
  v_exp     timestamptz;
  v_lic     uuid;
  v_old     public.licenses%rowtype;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  perform public.assert_not_banned();

  select reason, rec into v_reason, v_rec from public._promo_check(p_code, p_game_slug, v_user);
  if v_reason is not null then
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end if;
  if v_rec.kind <> 'license' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_license_code');
  end if;

  v_game := coalesce(v_rec.game_slug, p_game_slug);
  if not exists (select 1 from public.games where slug = v_game and is_published) then
    raise exception 'game_not_found';
  end if;

  v_exp := case when v_rec.license_days is null
                then null
                else now() + (v_rec.license_days || ' days')::interval end;

  select * into v_old from public.licenses
   where user_id = v_user and game_slug = v_game and revoked_at is null
   order by (expires_at is null) desc, expires_at desc nulls first
   limit 1;

  if found then
    -- Игра уже открыта. Постоянную лицензию временный код не трогает — иначе
    -- код «на неделю» отобрал бы у покупателя купленное навсегда.
    if v_old.expires_at is null then
      return jsonb_build_object('ok', false, 'reason', 'already_owned');
    end if;
    -- Временную продлеваем от большей из дат: остаток не сгорает.
    if v_exp is null then
      update public.licenses set expires_at = null, source = 'promo' where id = v_old.id;
    else
      update public.licenses
         set expires_at = greatest(v_old.expires_at, now()) + (v_rec.license_days || ' days')::interval
       where id = v_old.id;
    end if;
    v_lic := v_old.id;
  else
    insert into public.licenses (user_id, game_slug, source, expires_at)
    values (v_user, v_game, 'promo', v_exp)
    returning id into v_lic;
  end if;

  insert into public.promo_redemptions (code, user_id, license_id)
  values (v_rec.code, v_user, v_lic);
  update public.promo_codes set uses = uses + 1 where code = v_rec.code;

  return jsonb_build_object(
    'ok', true, 'kind', 'license', 'game', v_game,
    'days', v_rec.license_days,
    'expires_at', (select expires_at from public.licenses where id = v_lic));
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Заказ со скидкой
-- ═══════════════════════════════════════════════════════════════════════════
-- Прежняя create_order(p_game_slug) остаётся рабочей: второй аргумент
-- необязателен, старый клиент про него не знает.
create or replace function public.create_order(p_game_slug text, p_promo text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user     uuid := auth.uid();
  v_currency text;
  v_game     public.games%rowtype;
  v_full     integer;
  v_amount   integer;
  v_code     text := null;
  v_reason   text;
  v_rec      public.promo_codes;
  v_id       uuid;
begin
  perform public.assert_not_banned();
  if v_user is null then raise exception 'not_authenticated'; end if;

  select currency into v_currency from public.profiles where id = v_user;
  v_currency := coalesce(v_currency, 'USD');

  select * into v_game from public.games where slug = p_game_slug and is_published;
  if not found then raise exception 'game_not_found'; end if;

  if exists (select 1 from public.licenses
              where user_id = v_user and game_slug = p_game_slug and revoked_at is null
                and (expires_at is null or expires_at > now())) then
    raise exception 'already_owned';
  end if;

  v_full := case when v_currency = 'RUB' then v_game.price_rub else v_game.price_usd end;
  if v_full is null then raise exception 'price_not_set'; end if;
  v_amount := v_full;

  if p_promo is not null and btrim(p_promo) <> '' then
    select reason, rec into v_reason, v_rec from public._promo_check(p_promo, p_game_slug, v_user);
    -- Негодный код не роняет покупку: заказ создастся по полной цене, а
    -- сообщение игрок уже видел в предпросмотре.
    if v_reason is null and v_rec.kind = 'discount' then
      v_amount := public._promo_apply(v_rec, v_full);
      v_code := v_rec.code;
    end if;
  end if;

  -- Незавершённый заказ переиспользуется — но только пока по нему не создан
  -- платёж. Как только ссылка на оплату выдана, сумма зафиксирована на стороне
  -- сервиса, и менять её задним числом нельзя: тогда игрок видел бы одну цену,
  -- а списывалась другая. В этом случае заводится новый заказ, а старый просто
  -- истечёт у платёжного сервиса сам.
  select id into v_id from public.orders
   where user_id = v_user and game_slug = p_game_slug and status = 'pending'
     and provider_ref is null
   order by created_at desc limit 1;
  if found then
    -- Цена и код могли поменяться: игрок ввёл промокод или, наоборот, убрал его.
    update public.orders
       set amount = v_amount, amount_full = v_full, promo_code = v_code,
           currency = v_currency, provider = 'yookassa'
     where id = v_id;
    return v_id;
  end if;

  insert into public.orders (user_id, game_slug, provider, amount, amount_full, currency, status, promo_code)
  values (v_user, p_game_slug, 'yookassa', v_amount, v_full, v_currency, 'pending', v_code)
  returning id into v_id;

  return v_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Засчитать использование скидки — зовёт вебхук после оплаты
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.promo_mark_used(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.promo_code is null then return; end if;

  -- Повторный вызов вебхука не должен считать использование дважды.
  if exists (select 1 from public.promo_redemptions where order_id = p_order_id) then return; end if;

  insert into public.promo_redemptions (code, user_id, order_id)
  values (v_order.promo_code, v_order.user_id, p_order_id);
  update public.promo_codes set uses = uses + 1 where code = v_order.promo_code;
end;
$$;

revoke execute on function public.promo_mark_used(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
--  Админка
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.admin_promo_list()
returns setof public.promo_codes
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query select * from public.promo_codes order by created_at desc;
end;
$$;

create or replace function public.admin_promo_save(
  p_code text,
  p_kind text,
  p_game_slug text default null,
  p_percent_off smallint default null,
  p_amount_off integer default null,
  p_license_days integer default null,
  p_max_uses integer default null,
  p_per_user_limit smallint default 1,
  p_starts_at timestamptz default null,
  p_expires_at timestamptz default null,
  p_active boolean default true,
  p_note text default null
)
returns public.promo_codes
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v public.promo_codes;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  insert into public.promo_codes as pc
    (code, kind, game_slug, percent_off, amount_off, license_days,
     max_uses, per_user_limit, starts_at, expires_at, active, note, created_by)
  values
    (upper(btrim(p_code)), p_kind::public.promo_kind, p_game_slug, p_percent_off, p_amount_off,
     p_license_days, p_max_uses, coalesce(p_per_user_limit, 1), p_starts_at, p_expires_at,
     coalesce(p_active, true), p_note, auth.uid())
  on conflict (code) do update set
    kind = excluded.kind, game_slug = excluded.game_slug,
    percent_off = excluded.percent_off, amount_off = excluded.amount_off,
    license_days = excluded.license_days, max_uses = excluded.max_uses,
    per_user_limit = excluded.per_user_limit, starts_at = excluded.starts_at,
    expires_at = excluded.expires_at, active = excluded.active, note = excluded.note
  returning * into v;

  return v;
end;
$$;

create or replace function public.admin_promo_delete(p_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.promo_codes where code = upper(btrim(p_code));
end;
$$;

-- Кто и когда воспользовался конкретным кодом.
create or replace function public.admin_promo_uses(p_code text)
returns table (nickname text, redeemed_at timestamptz, kind text)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select p.nickname, r.redeemed_at,
           case when r.license_id is not null then 'license' else 'order' end
      from public.promo_redemptions r
      left join public.profiles p on p.id = r.user_id
     where r.code = upper(btrim(p_code))
     order by r.redeemed_at desc;
end;
$$;

-- Права: рядовому игроку нужны только предпросмотр и погашение.
revoke execute on function public.promo_preview(text, text) from public, anon;
revoke execute on function public.promo_redeem(text, text)  from public, anon;
revoke execute on function public.create_order(text, text)   from public, anon;
grant  execute on function public.promo_preview(text, text) to authenticated;
grant  execute on function public.promo_redeem(text, text)  to authenticated;
grant  execute on function public.create_order(text, text)   to authenticated;

revoke execute on function public.admin_promo_list()  from public, anon;
revoke execute on function public.admin_promo_delete(text) from public, anon;
revoke execute on function public.admin_promo_uses(text)   from public, anon;
revoke execute on function public.admin_promo_save(
  text, text, text, smallint, integer, integer, integer, smallint,
  timestamptz, timestamptz, boolean, text) from public, anon;
grant execute on function public.admin_promo_list()  to authenticated;
grant execute on function public.admin_promo_delete(text) to authenticated;
grant execute on function public.admin_promo_uses(text)   to authenticated;
grant execute on function public.admin_promo_save(
  text, text, text, smallint, integer, integer, integer, smallint,
  timestamptz, timestamptz, boolean, text) to authenticated;
