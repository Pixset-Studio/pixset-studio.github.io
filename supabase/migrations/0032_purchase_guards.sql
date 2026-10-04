-- ============================================================================
--  ЗАЩИТА ОТ ПОВТОРНЫХ ПОКУПОК И ДУБЛЕЙ
--
--  Что было не так (видно по очереди «Ожидают подтверждения»: пять оплаченных
--  заказов на одну и ту же игру у одного игрока):
--
--   1. create_order проверял «игра уже куплена» только по таблице licenses. Пока
--      заказ оплачен, но лицензия ещё не выдана (ручное подтверждение, задержка
--      вебхука), проверка не срабатывала — и страница позволяла заплатить ещё раз,
--      и ещё, и ещё.
--   2. Повторный заказ не находил прежний, если у того уже был создан платёж
--      (provider_ref) — и заводил новый, то есть второй параллельный платёж.
--   3. grant_paid_order считал заказ «уже выданным», только если лицензия
--      ссылается именно на него. У дубля такой лицензии нет, поэтому выдача
--      «проходила» заново — и начисляла баллы ещё раз за ту же игру. Заодно она
--      перезаписывала licenses.order_id, и возврат дубля отозвал бы настоящую
--      лицензию.
--   4. Оплата с баланса не блокировала строки: два одновременных клика могли
--      списать баланс дважды.
--
--  Что теперь:
--   • у заказа есть handled_at — «обработан» (лицензия выдана / баланс зачислен);
--     очередь в админке = оплачен и не обработан;
--   • grant_paid_order смотрит на владение игрой, а не на «свою» лицензию:
--     дубль лицензию НЕ трогает, баллов НЕ даёт и остаётся в очереди с пометкой
--     «дубль» — до возврата денег в ЮKassa (после возврата вебхук уберёт его
--     сам) или пока админ не нажмёт «Скрыть»;
--   • create_order отказывает, если оплата уже прошла и ждёт выдачи, и не даёт
--     открыть второй платёж на другую сумму, пока первый не завершён;
--   • на игрока и игру — не больше одного открытого (pending) заказа: это
--     гарантирует уникальный индекс, а не только проверка в коде;
--   • пополнение и оплата с баланса защищены от повторов и гонок.
--
--  Идемпотентна: можно вставить в Supabase → SQL Editor целиком.
--  ВАЖНО: деньги за уже созданные дубли эта миграция НЕ возвращает — возврат
--  делается вручную в кабинете ЮKassa (см. ответ в чате / docs/PAYMENTS.md).
-- ============================================================================

alter table public.orders add column if not exists handled_at   timestamptz;
alter table public.orders add column if not exists handled_note text;

-- ── Закрыть незавершённый заказ и вернуть зарезервированные баллы ────────────
create or replace function public._close_pending_order(p_order_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v public.orders%rowtype;
begin
  select * into v from public.orders where id = p_order_id for update;
  if not found or v.status <> 'pending' then return; end if;

  update public.orders set status = 'failed', points_used = 0 where id = p_order_id;

  if v.points_used > 0 then
    insert into public.points (user_id, balance) values (v.user_id, 0)
      on conflict (user_id) do nothing;
    update public.points set balance = balance + v.points_used, updated_at = now()
      where user_id = v.user_id;
    insert into public.points_transactions (user_id, kind, amount, balance_after, order_id, note)
    select v.user_id, 'redeem_refund', v.points_used, p.balance, p_order_id, p_note
      from public.points p where p.user_id = v.user_id;
  end if;
end;
$$;
revoke execute on function public._close_pending_order(uuid, text) from public, anon, authenticated;

-- ── Разовая уборка: оставляем на игрока и игру один (самый свежий) открытый заказ ─
do $$
declare
  r record;
begin
  for r in
    select id from (
      select id, row_number() over (partition by user_id, game_slug order by created_at desc) rn
        from public.orders
       where kind = 'purchase' and status = 'pending'
    ) q where rn > 1
  loop
    perform public._close_pending_order(r.id, 'заказ закрыт как дубль — баллы вернулись');
  end loop;
end $$;

create unique index if not exists orders_one_open_purchase
  on public.orders (user_id, game_slug)
  where kind = 'purchase' and status = 'pending';

-- ── Уже выданные заказы помечаем обработанными ───────────────────────────────
update public.orders o
   set handled_at = coalesce(o.paid_at, now())
 where o.status = 'paid' and o.handled_at is null
   and (
     (o.kind = 'purchase' and exists (select 1 from public.licenses l where l.order_id = o.id))
     or
     (o.kind = 'wallet_topup' and exists (select 1 from public.wallet_transactions t
                                           where t.order_id = o.id and t.kind = 'topup'))
   );

-- ============================================================================
--  Выдача после оплаты: теперь идемпотентна по-настоящему
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
  -- Блокируем строку: два одновременных вызова (вебхук + кнопка «Выдать»)
  -- выстроятся в очередь, и второй увидит уже проставленный handled_at.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Заказ не найден.'; end if;
  if v_order.status <> 'paid' then
    raise exception 'Заказ ещё не оплачен (статус: %).', v_order.status;
  end if;
  if v_order.handled_at is not null then return; end if;      -- уже обработан

  if v_order.kind = 'wallet_topup' then
    insert into public.wallets (user_id, balance) values (v_order.user_id, 0)
      on conflict (user_id) do nothing;
    update public.wallets set balance = balance + v_order.amount, updated_at = now()
      where user_id = v_order.user_id;
    insert into public.wallet_transactions (user_id, kind, amount, balance_after, order_id)
    select v_order.user_id, 'topup', v_order.amount, w.balance, p_order_id
      from public.wallets w where w.user_id = v_order.user_id;
    update public.orders set handled_at = now() where id = p_order_id;
    return;
  end if;

  -- kind = 'purchase'. Постоянная лицензия на эту игру уже есть (выдана этим или
  -- более ранним заказом, промокодом «навсегда» или вручную) — значит, это дубль:
  -- лицензию не трогаем (иначе её order_id перезапишется, и возврат дубля отозвал
  -- бы настоящую), баллы не начисляем. Заказ остаётся в очереди админки с
  -- пометкой «дубль», пока деньги не вернут.
  if exists (select 1 from public.licenses l
              where l.user_id = v_order.user_id and l.game_slug = v_order.game_slug
                and l.revoked_at is null and l.expires_at is null) then
    update public.orders set handled_note = 'duplicate' where id = p_order_id;
    return;
  end if;

  -- Временная лицензия (промокод на срок) не мешает: покупка делает её постоянной.
  insert into public.licenses (user_id, game_slug, order_id, source, revoked_at, expires_at)
  values (v_order.user_id, v_order.game_slug, v_order.id, 'purchase', null, null)
  on conflict (user_id, game_slug) do update
    set order_id = excluded.order_id, source = 'purchase', revoked_at = null, expires_at = null;

  if v_order.promo_code is not null then
    perform public.promo_mark_used(v_order.id);
  end if;

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

  update public.orders set points_earned = v_earn, handled_at = now(), handled_note = null
   where id = p_order_id;
end;
$$;

-- ============================================================================
--  create_order: не даёт платить дважды
-- ============================================================================
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
  v_user        uuid := auth.uid();
  v_currency    text;
  v_game        public.games%rowtype;
  v_full        integer;
  v_amount      integer;
  v_code        text := null;
  v_reason      text;
  v_rec         public.promo_codes;
  v_chk         record;
  v_sale        uuid := null;
  v_sale_p      integer;
  v_promo_p     integer;
  v_points_bal  integer;
  v_points_use  integer := 0;
  v_id          uuid;
  v_has_pending boolean;
  v_old_points  integer;
  v_old_amount  integer;
  v_old_ref     text;
  v_delta       integer;
  v_stale       uuid;
begin
  perform public.assert_not_banned();
  if v_user is null then raise exception 'not_authenticated'; end if;

  -- Один игрок + одна игра = один поток. Два одновременных нажатия «Купить»
  -- (двойной клик, две вкладки) выстраиваются в очередь, а не плодят заказы.
  perform pg_advisory_xact_lock(hashtextextended('order:' || v_user::text || ':' || p_game_slug, 0));

  select currency into v_currency from public.profiles where id = v_user;
  v_currency := coalesce(v_currency, 'USD');

  select * into v_game from public.games where slug = p_game_slug and is_published;
  if not found then raise exception 'game_not_found'; end if;

  if exists (select 1 from public.licenses
              where user_id = v_user and game_slug = p_game_slug and revoked_at is null
                and (expires_at is null or expires_at > now())) then
    raise exception 'already_owned';
  end if;

  -- Оплата уже прошла, а выдача ждёт (ручное подтверждение или задержка
  -- вебхука). Вторая оплата за ту же игру — это деньги на ветер.
  if exists (select 1 from public.orders
              where user_id = v_user and game_slug = p_game_slug and kind = 'purchase'
                and status = 'paid' and handled_at is null) then
    raise exception 'Оплата за эту игру уже прошла и ждёт подтверждения. Платить ещё раз не нужно — если игра не откроется в течение часа, напишите в поддержку.';
  end if;

  -- Совсем старые незавершённые заказы закрываем и возвращаем баллы.
  for v_stale in
    select id from public.orders
     where user_id = v_user and game_slug = p_game_slug and kind = 'purchase'
       and status = 'pending' and created_at < now() - interval '24 hours'
  loop
    perform public._close_pending_order(v_stale, 'заказ устарел — баллы вернулись');
  end loop;

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

  select id, points_used, amount, provider_ref
    into v_id, v_old_points, v_old_amount, v_old_ref
    from public.orders
   where user_id = v_user and game_slug = p_game_slug and kind = 'purchase' and status = 'pending'
   order by created_at desc limit 1;
  v_has_pending := found;

  -- Баллы, уже зарезервированные прежним заказом, снова доступны для пересчёта.
  select coalesce(balance, 0) into v_points_bal from public.points where user_id = v_user;
  v_points_bal := coalesce(v_points_bal, 0) + case when v_has_pending then coalesce(v_old_points, 0) else 0 end;

  if p_use_points and v_points_bal > 0 then
    v_points_use := least(v_points_bal, greatest(0, v_amount - 100));
  end if;
  v_amount := v_amount - v_points_use;

  if v_has_pending then
    if v_old_ref is not null then
      -- Платёж по этому заказу уже создан в ЮKassa: сумму менять нельзя, а второй
      -- параллельный платёж открывать опасно — оплатят оба.
      if v_amount = v_old_amount and v_points_use = coalesce(v_old_points, 0) then
        return v_id;                    -- та же сумма: отдаём тот же заказ и тот же платёж
      end if;
      raise exception 'У вас уже открыт платёж за эту игру на другую сумму. Завершите его или дождитесь, пока он будет отменён, — потом можно оформить заново.';
    end if;

    v_delta := v_points_use - coalesce(v_old_points, 0);
    if v_delta <> 0 then
      update public.points set balance = balance - v_delta, updated_at = now() where user_id = v_user;
    end if;
    update public.orders
       set amount = v_amount, amount_full = v_full, promo_code = v_code, sale_id = v_sale,
           currency = v_currency, provider = 'yookassa', points_used = v_points_use
     where id = v_id;
    return v_id;
  end if;

  if v_points_use > 0 then
    update public.points set balance = balance - v_points_use, updated_at = now() where user_id = v_user;
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
--  Оплата с баланса: блокировки и проверки против гонок и двойной оплаты
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

  select * into v_order from public.orders where id = p_order_id and user_id = v_user for update;
  if not found then raise exception 'Заказ не найден.'; end if;
  if v_order.kind <> 'purchase' then
    raise exception 'Балансом можно оплатить только покупку игры.';
  end if;
  if v_order.status = 'paid' then raise exception 'Заказ уже оплачен.'; end if;
  if v_order.status <> 'pending' then
    raise exception 'Этот заказ оплатить нельзя (статус: %).', v_order.status;
  end if;
  if v_order.provider_ref is not null then
    -- По заказу уже открыт платёж картой: оплатить его ещё и балансом значило бы
    -- заплатить дважды.
    raise exception 'По этому заказу уже открыт платёж картой. Завершите его или дождитесь, пока он будет отменён.';
  end if;
  if exists (select 1 from public.licenses
              where user_id = v_user and game_slug = v_order.game_slug and revoked_at is null
                and expires_at is null) then
    raise exception 'Эта игра уже есть на вашем аккаунте.';
  end if;

  select balance into v_bal from public.wallets where user_id = v_user for update;
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
--  Пополнение: не плодим одинаковые заказы и не даём спамить
-- ============================================================================
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
  v_recent   integer;
begin
  perform public.assert_not_banned();
  if v_user is null then raise exception 'not_authenticated'; end if;

  perform pg_advisory_xact_lock(hashtextextended('topup:' || v_user::text, 0));

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

  -- Та же сумма и заказ ещё открыт — отдаём его же: тот же платёж, а не второй.
  select id into v_id from public.orders
   where user_id = v_user and kind = 'wallet_topup' and status = 'pending'
     and amount = p_amount and created_at > now() - interval '1 hour'
   order by created_at desc limit 1;
  if found then return v_id; end if;

  select count(*) into v_recent from public.orders
   where user_id = v_user and kind = 'wallet_topup' and status = 'pending'
     and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'Слишком много незавершённых пополнений. Завершите начатые или подождите немного.';
  end if;

  insert into public.orders (user_id, game_slug, kind, provider, amount, amount_full, currency, status)
  values (v_user, null, 'wallet_topup', 'yookassa', p_amount, p_amount, v_currency, 'pending')
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================================
--  Админка: очередь с пометкой «дубль» и кнопкой «Скрыть»
-- ============================================================================
drop function if exists public.admin_pending_orders();
create function public.admin_pending_orders()
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
  paid_at    timestamptz,
  duplicate  boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  return query
    select o.id, o.kind, u.email::text, p.nickname, o.game_slug, g.title,
           o.amount, o.currency, o.promo_code, o.paid_at,
           (o.kind = 'purchase' and exists (
              select 1 from public.licenses l
               where l.user_id = o.user_id and l.game_slug = o.game_slug
                 and l.revoked_at is null and l.expires_at is null))
      from public.orders o
      join auth.users u on u.id = o.user_id
      left join public.profiles p on p.id = o.user_id
      left join public.games g on g.slug = o.game_slug
     where o.status = 'paid' and o.handled_at is null
     order by o.paid_at desc nulls last;
end;
$$;

-- «Выдать» на обычном заказе выдаёт. На дубле — скрывает запись из очереди
-- (лицензия и баллы не трогаются); деньги при этом остаются у вас, пока вы не
-- вернёте их в кабинете ЮKassa.
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

  update public.orders
     set handled_at = now(), handled_note = 'duplicate, скрыто админом'
   where id = p_order_id and handled_at is null and handled_note = 'duplicate';
end;
$$;

-- ── Права ────────────────────────────────────────────────────────────────────
revoke execute on function public.create_order(text, text, boolean) from public, anon;
revoke execute on function public.create_wallet_topup(integer)       from public, anon;
revoke execute on function public.pay_order_with_wallet(uuid)        from public, anon;
revoke execute on function public.grant_paid_order(uuid)             from public, anon, authenticated;
revoke execute on function public.admin_pending_orders()             from public, anon;
revoke execute on function public.admin_confirm_order(uuid)          from public, anon;

grant execute on function public.create_order(text, text, boolean)   to authenticated;
grant execute on function public.create_wallet_topup(integer)        to authenticated;
grant execute on function public.pay_order_with_wallet(uuid)         to authenticated;
grant execute on function public.admin_pending_orders()              to authenticated;
grant execute on function public.admin_confirm_order(uuid)           to authenticated;
