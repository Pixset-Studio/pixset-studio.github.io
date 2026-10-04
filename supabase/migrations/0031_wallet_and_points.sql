-- ============================================================================
--  КОШЕЛЁК И БАЛЛЫ
--
--  Кошелёк — пополняемый баланс на аккаунте (как в Steam): игрок закидывает
--  деньги один раз через ЮKassa, а дальше расплачивается балансом за любую
--  игру каталога без нового платежа. Баллы — бонус 10% от суммы КАЖДОЙ
--  покупки игры (неважно, чем оплаченной — картой или балансом), которые
--  можно потратить как скидку на будущую покупку. Пополнение баланса баллов
--  не даёт — иначе баллы можно было бы просто купить, а не заработать.
--
--  Юридическая оговорка (я не юрист, сверьте с вашим): баланс сделан НЕ
--  выводимым и НЕ передаваемым — потратить его можно только на игры каталога,
--  обменять на деньги или на баллы нельзя. Такой «магазинный кредит»
--  устроен проще, чем электронные деньги по 161-ФЗ, но это не юридическая
--  консультация — для уверенности стоит свериться с юристом или бухгалтером,
--  особенно если сумма пополнений станет заметной.
--
--  Как это работает:
--    • orders обзавелась kind ('purchase' | 'wallet_topup') — пополнение
--      идёт через тот же платёжный конвейер (payment / yookassa-webhook),
--      что и покупка игры, только game_slug у него null.
--    • Выдача после оплаты — раньше эта логика была прямо в вебхуке и в
--      admin_confirm_order по отдельности (и уже начала расходиться), здесь
--      она сведена в одну функцию grant_paid_order: и вебхук (автоматически),
--      и кнопка «Выдать» в админке (вручную) зовут одно и то же. Тот же
--      переключатель payments_auto_grant (0030) решает, происходит ли это
--      сразу или ждёт подтверждения владельцем студии — теперь для обоих
--      видов заказа сразу.
--    • Оплата с баланса (pay_order_with_wallet) — отдельная от ЮKassa: баланс
--      уже наш собственный, ждать вебхук не нужно, выдача происходит сразу.
--    • Идемпотентна: можно вставить в Supabase → SQL Editor целиком.
-- ============================================================================

-- ── orders: вид заказа и учёт баллов ────────────────────────────────────────
alter table public.orders add column if not exists kind text not null default 'purchase';
alter table public.orders add column if not exists points_used integer not null default 0;
alter table public.orders add column if not exists points_earned integer not null default 0;
-- Пополнение не привязано к игре — game_slug должен разрешать null.
-- DROP NOT NULL идемпотентен сам по себе (повторный запуск не ошибка).
alter table public.orders alter column game_slug drop not null;

do $$ begin
  alter table public.orders add constraint orders_kind_check
    check (kind in ('purchase', 'wallet_topup'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.orders add constraint orders_kind_game_consistency check (
    (kind = 'purchase'     and game_slug is not null) or
    (kind = 'wallet_topup' and game_slug is null)
  );
exception when duplicate_object then null; end $$;

-- ── Кошелёк ──────────────────────────────────────────────────────────────────
create table if not exists public.wallets (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),   -- в копейках/центах
  updated_at timestamptz not null default now()
);
alter table public.wallets enable row level security;
do $$ begin
  create policy "own wallet" on public.wallets for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create table if not exists public.wallet_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('topup', 'purchase', 'refund', 'admin_adjust')),
  amount        integer not null,          -- со знаком: + пополнение/возврат, − списание
  balance_after integer not null,
  order_id      uuid references public.orders(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists wallet_tx_user_idx on public.wallet_transactions (user_id, created_at desc);
alter table public.wallet_transactions enable row level security;
do $$ begin
  create policy "own wallet transactions" on public.wallet_transactions
    for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ── Баллы ────────────────────────────────────────────────────────────────────
create table if not exists public.points (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),   -- в копейках/центах валюты аккаунта
  updated_at timestamptz not null default now()
);
alter table public.points enable row level security;
do $$ begin
  create policy "own points" on public.points for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create table if not exists public.points_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('earn', 'redeem', 'earn_clawback', 'redeem_refund', 'admin_adjust')),
  amount        integer not null,
  balance_after integer not null,
  order_id      uuid references public.orders(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists points_tx_user_idx on public.points_transactions (user_id, created_at desc);
alter table public.points_transactions enable row level security;
do $$ begin
  create policy "own points transactions" on public.points_transactions
    for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Ни на wallets/points/*_transactions нет INSERT/UPDATE-политик для игрока —
-- пишут в них только security definer-функции ниже (и вебхук сервисным
-- ключом, который RLS обходит в любом случае). Игрок эти таблицы только
-- читает, и то — исключительно свои строки.

-- ============================================================================
--  Пополнение баланса
-- ============================================================================
-- ЮKassa принимает только российские карты (см. payment/index.ts) — тем же
-- ограничением пока живёт и пополнение: рублёвым аккаунтам, остальным явный
-- отказ, а не платёж в пустоту.
create or replace function public.create_wallet_topup(p_amount integer)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user     uuid := auth.uid();
  v_currency text;
  v_id       uuid;
begin
  perform public.assert_not_banned();
  if v_user is null then raise exception 'not_authenticated'; end if;

  select currency into v_currency from public.profiles where id = v_user;
  v_currency := coalesce(v_currency, 'USD');

  if v_currency <> 'RUB' then
    raise exception 'Пополнение баланса пока доступно только для рублёвых аккаунтов.';
  end if;
  if p_amount is null or p_amount < 10000 then
    raise exception 'Минимальное пополнение — 100 ₽.';
  end if;
  if p_amount > 15000000 then
    raise exception 'Слишком крупное пополнение за раз — напишите в поддержку.';
  end if;

  insert into public.orders (user_id, game_slug, kind, provider, amount, amount_full, currency, status)
  values (v_user, null, 'wallet_topup', 'yookassa', p_amount, p_amount, v_currency, 'pending')
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================================
--  Выдача после оплаты — общая для автоматического пути (вебхук) и ручного
--  (кнопка в админке). Идемпотентна: повторный вызов на уже выданный заказ
--  тихо ничего не делает — вместо того, чтобы начислить дважды.
-- ============================================================================
create or replace function public.grant_paid_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order public.orders%rowtype;
  v_earn  integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Заказ не найден.'; end if;
  if v_order.status <> 'paid' then
    raise exception 'Заказ ещё не оплачен (статус: %).', v_order.status;
  end if;

  if v_order.kind = 'wallet_topup' then
    if exists (select 1 from public.wallet_transactions
                where order_id = p_order_id and kind = 'topup') then
      return;                                        -- уже зачислено
    end if;
    insert into public.wallets (user_id, balance) values (v_order.user_id, 0)
      on conflict (user_id) do nothing;
    update public.wallets set balance = balance + v_order.amount, updated_at = now()
      where user_id = v_order.user_id;
    insert into public.wallet_transactions (user_id, kind, amount, balance_after, order_id)
    select v_order.user_id, 'topup', v_order.amount, w.balance, p_order_id
      from public.wallets w where w.user_id = v_order.user_id;
    return;
  end if;

  -- kind = 'purchase'
  if exists (select 1 from public.licenses where order_id = p_order_id) then
    return;                                          -- уже выдано
  end if;

  insert into public.licenses (user_id, game_slug, order_id, source, revoked_at, expires_at)
  values (v_order.user_id, v_order.game_slug, v_order.id, 'purchase', null, null)
  on conflict (user_id, game_slug) do update
    set order_id = excluded.order_id, source = 'purchase', revoked_at = null, expires_at = null;

  if v_order.promo_code is not null then
    perform public.promo_mark_used(v_order.id);
  end if;

  -- Баллы — 10% от РЕАЛЬНО уплаченной суммы (после скидок и уже списанных
  -- баллов), округление вниз до копейки/цента. Пополнение баланса баллов не
  -- даёт — та ветка выше, сюда не попадает.
  v_earn := floor(v_order.amount * 0.10)::integer;
  if v_earn > 0 then
    insert into public.points (user_id, balance) values (v_order.user_id, 0)
      on conflict (user_id) do nothing;
    update public.points set balance = balance + v_earn, updated_at = now()
      where user_id = v_order.user_id;
    insert into public.points_transactions (user_id, kind, amount, balance_after, order_id)
    select v_order.user_id, 'earn', v_earn, p.balance, p_order_id
      from public.points p where p.user_id = v_order.user_id;
  end if;

  update public.orders set points_earned = v_earn where id = p_order_id;
end;
$$;

-- ── Откат при возврате — снимает лицензию/зачисление, отыгрывает баллы ──────
create or replace function public.revoke_paid_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then return; end if;

  if v_order.kind = 'wallet_topup' then
    if not exists (select 1 from public.wallet_transactions
                    where order_id = p_order_id and kind = 'topup')
       or exists (select 1 from public.wallet_transactions
                    where order_id = p_order_id and kind = 'refund') then
      return;                     -- нечего забирать или уже забрано
    end if;
    -- greatest(0, ...): баланс к этому моменту мог быть уже потрачен на игры —
    -- в минус его не уводим, просто списываем сколько осталось.
    update public.wallets set balance = greatest(0, balance - v_order.amount), updated_at = now()
      where user_id = v_order.user_id;
    insert into public.wallet_transactions (user_id, kind, amount, balance_after, order_id)
    select v_order.user_id, 'refund', -v_order.amount, w.balance, p_order_id
      from public.wallets w where w.user_id = v_order.user_id;
    return;
  end if;

  update public.licenses set revoked_at = now()
   where order_id = p_order_id and revoked_at is null;

  if v_order.points_earned > 0
     and not exists (select 1 from public.points_transactions
                       where order_id = p_order_id and kind = 'earn_clawback') then
    update public.points set balance = greatest(0, balance - v_order.points_earned), updated_at = now()
      where user_id = v_order.user_id;
    insert into public.points_transactions (user_id, kind, amount, balance_after, order_id, note)
    select v_order.user_id, 'earn_clawback', -v_order.points_earned, p.balance, p_order_id,
           'заказ возвращён — списаны начисленные баллы'
      from public.points p where p.user_id = v_order.user_id;
  end if;

  if v_order.points_used > 0
     and not exists (select 1 from public.points_transactions
                       where order_id = p_order_id and kind = 'redeem_refund') then
    insert into public.points (user_id, balance) values (v_order.user_id, 0)
      on conflict (user_id) do nothing;
    update public.points set balance = balance + v_order.points_used, updated_at = now()
      where user_id = v_order.user_id;
    insert into public.points_transactions (user_id, kind, amount, balance_after, order_id, note)
    select v_order.user_id, 'redeem_refund', v_order.points_used, p.balance, p_order_id,
           'заказ возвращён — списанные баллы вернулись'
      from public.points p where p.user_id = v_order.user_id;
  end if;
end;
$$;

-- ============================================================================
--  Оплата с баланса — минуя ЮKassa: деньги уже наши, ждать вебхук незачем.
-- ============================================================================
create or replace function public.pay_order_with_wallet(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user  uuid := auth.uid();
  v_order public.orders%rowtype;
  v_bal   integer;
begin
  perform public.assert_not_banned();
  if v_user is null then raise exception 'not_authenticated'; end if;

  select * into v_order from public.orders where id = p_order_id and user_id = v_user;
  if not found then raise exception 'Заказ не найден.'; end if;
  if v_order.kind <> 'purchase' then
    raise exception 'Балансом можно оплатить только покупку игры.';
  end if;
  if v_order.status = 'paid' then raise exception 'Заказ уже оплачен.'; end if;
  if v_order.status not in ('pending', 'failed') then
    raise exception 'Этот заказ оплатить нельзя (статус: %).', v_order.status;
  end if;

  select balance into v_bal from public.wallets where user_id = v_user;
  v_bal := coalesce(v_bal, 0);
  if v_bal < v_order.amount then
    raise exception 'На балансе не хватает средств для этой покупки.';
  end if;

  update public.wallets set balance = balance - v_order.amount, updated_at = now()
    where user_id = v_user;
  insert into public.wallet_transactions (user_id, kind, amount, balance_after, order_id)
  select v_user, 'purchase', -v_order.amount, w.balance, p_order_id
    from public.wallets w where w.user_id = v_user;

  update public.orders set status = 'paid', provider = 'wallet', paid_at = now()
   where id = p_order_id;

  perform public.grant_paid_order(p_order_id);
end;
$$;

-- ============================================================================
--  create_order: промокод/распродажа (как в 0022/0029) + новая скидка баллами
-- ============================================================================
-- Баллы — скидка СВЕРХ лучшей цены от промокода/распродажи, а не вместо нёе:
-- это отдельный бонус за лояльность, а не ещё один купон. Пол — 1 рубль/цент,
-- тот же, что у промокодов и распродаж (_promo_apply, _sale_best).
--
-- Заказ можно пересоздать (нажал «Купить», передумал, зашёл снова) — тогда
-- прежний резерв баллов сначала возвращается, а нужная сумма списывается
-- заново под актуальную цену; иначе баллы утекали бы в заброшенные версии
-- заказа.
create or replace function public.create_order(
  p_game_slug text,
  p_promo text default null,
  p_use_points boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user       uuid := auth.uid();
  v_currency   text;
  v_game       public.games%rowtype;
  v_full       integer;
  v_amount     integer;
  v_code       text := null;
  v_reason     text;
  v_rec        public.promo_codes;
  v_chk        record;
  v_sale       uuid := null;
  v_sale_p     integer;
  v_promo_p    integer;
  v_points_bal integer;
  v_points_use integer := 0;
  v_old_points integer;
  v_id         uuid;
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

  select sb.sale_id, sb.price into v_sale, v_sale_p
    from public._sale_best(p_game_slug, v_currency, v_full) sb;
  if v_sale is not null then v_amount := v_sale_p; end if;

  if p_promo is not null and btrim(p_promo) <> '' then
    select * into v_chk from public._promo_check(p_promo, p_game_slug, v_user);
    v_reason := v_chk.reason;
    v_rec    := v_chk.rec;
    if v_reason is null and v_rec.kind = 'discount' then
      v_promo_p := public._promo_apply(v_rec, v_full);
      if v_promo_p < v_amount then
        v_amount := v_promo_p;
        v_code   := v_rec.code;
        v_sale   := null;
      end if;
    end if;
  end if;

  -- ── Баллы: скидка поверх уже посчитанной цены ──────────────────────────────
  if p_use_points then
    select balance into v_points_bal from public.points where user_id = v_user;
    v_points_bal := coalesce(v_points_bal, 0);
    if v_points_bal > 0 then
      v_points_use := least(v_points_bal, greatest(0, v_amount - 100));
    end if;
  end if;
  v_amount := v_amount - v_points_use;

  select id, points_used into v_id, v_old_points from public.orders
   where user_id = v_user and game_slug = p_game_slug and status = 'pending'
     and provider_ref is null
   order by created_at desc limit 1;

  if found then
    if coalesce(v_old_points, 0) > 0 then
      update public.points set balance = balance + v_old_points, updated_at = now()
        where user_id = v_user;
    end if;
    if v_points_use > 0 then
      update public.points set balance = balance - v_points_use, updated_at = now()
        where user_id = v_user;
    end if;
    update public.orders
       set amount = v_amount, amount_full = v_full, promo_code = v_code, sale_id = v_sale,
           currency = v_currency, provider = 'yookassa', points_used = v_points_use
     where id = v_id;
    return v_id;
  end if;

  if v_points_use > 0 then
    update public.points set balance = balance - v_points_use, updated_at = now()
      where user_id = v_user;
  end if;

  insert into public.orders
    (user_id, game_slug, kind, provider, amount, amount_full, currency, status, promo_code, sale_id, points_used)
  values
    (v_user, p_game_slug, 'purchase', 'yookassa', v_amount, v_full, v_currency, 'pending', v_code, v_sale, v_points_use)
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================================
--  Админка
-- ============================================================================
-- Очередь «Ожидают подтверждения» теперь смотрит в нужный журнал по виду
-- заказа: у покупки это licenses, у пополнения — wallet_transactions.
create or replace function public.admin_pending_orders()
returns table (
  id         uuid,
  kind       text,
  email      text,
  nickname   text,
  game_slug  text,
  game_title text,
  amount     integer,
  currency   text,
  promo_code text,
  paid_at    timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  return query
    select o.id, o.kind, u.email::text, p.nickname, o.game_slug, g.title,
           o.amount, o.currency, o.promo_code, o.paid_at
      from public.orders o
      join auth.users u on u.id = o.user_id
      left join public.profiles p on p.id = o.user_id
      left join public.games g on g.slug = o.game_slug
     where o.status = 'paid'
       and (
         (o.kind = 'purchase'
            and not exists (select 1 from public.licenses l where l.order_id = o.id))
         or
         (o.kind = 'wallet_topup'
            and not exists (select 1 from public.wallet_transactions wt
                              where wt.order_id = o.id and wt.kind = 'topup'))
       )
     order by o.paid_at desc nulls last;
end;
$$;

-- Теперь просто зовёт общую grant_paid_order — она сама разбирает вид заказа
-- и сама же идемпотентна (повторное «Выдать» ничего не сломает).
create or replace function public.admin_confirm_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status public.order_status;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select status into v_status from public.orders where id = p_order_id;
  if not found then raise exception 'Заказ не найден.'; end if;
  if v_status <> 'paid' then
    raise exception 'Заказ ещё не оплачен (статус: %).', v_status;
  end if;

  perform public.grant_paid_order(p_order_id);
end;
$$;

-- ── Права ────────────────────────────────────────────────────────────────────
-- create_order пересоздана (0022/0029 → эта версия): права сохраняются при
-- create or replace, но повторяем — так файл читается сам по себе.
revoke execute on function public.create_order(text, text, boolean)     from public, anon;
revoke execute on function public.create_wallet_topup(integer)          from public, anon;
revoke execute on function public.pay_order_with_wallet(uuid)           from public, anon;
revoke execute on function public.grant_paid_order(uuid)                from public, anon, authenticated;
revoke execute on function public.revoke_paid_order(uuid)               from public, anon, authenticated;
revoke execute on function public.admin_pending_orders()                from public, anon;
revoke execute on function public.admin_confirm_order(uuid)             from public, anon;

grant execute on function public.create_order(text, text, boolean)      to authenticated;
grant execute on function public.create_wallet_topup(integer)           to authenticated;
grant execute on function public.pay_order_with_wallet(uuid)            to authenticated;
grant execute on function public.admin_pending_orders()                 to authenticated;
grant execute on function public.admin_confirm_order(uuid)              to authenticated;
-- grant_paid_order и revoke_paid_order намеренно не выданы даже authenticated:
-- их зовут только сервисный ключ вебхука и SECURITY DEFINER-функции выше
-- (тот же приём, что уже применён к promo_mark_used в 0022).
