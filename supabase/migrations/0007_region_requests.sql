-- Pixset Studio: заявки на смену региона.
--
-- Регион задаётся один раз при регистрации и определяет валюту цен. Менять его
-- самому нельзя: иначе достаточно было бы переключить страну, чтобы купить игру
-- по чужому прайсу. Поэтому игрок объясняет причину, а решение принимает
-- студия — как и в любом магазине с региональными ценами.
--
-- Письмо о решении отправляет edge-функция region-decide: она же и вызывает
-- region_decide, чтобы «регион сменён» и «письмо отправлено» не разъезжались.
--
-- Применить: Supabase → SQL Editor → выполнить целиком.

create type public.region_request_status as enum ('pending', 'approved', 'rejected');

create table public.region_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- Что было на момент подачи: решение может приниматься через неделю, и
  -- «откуда переезжали» иначе восстановить нечем.
  from_country  text,
  from_currency text not null,
  to_country    text not null,
  to_currency   text not null,
  reason        text not null,
  status        public.region_request_status not null default 'pending',
  admin_comment text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references auth.users(id) on delete set null,

  constraint region_country_shape check (to_country ~ '^[A-Z]{2}$'),
  constraint region_currency_known check (to_currency in ('RUB', 'USD')),
  -- Причина обязана быть содержательной: «хочу» не даёт студии ничего, на чём
  -- можно основать решение.
  constraint region_reason_length check (char_length(btrim(reason)) between 30 and 1000)
);

create index region_requests_user_idx on public.region_requests (user_id, created_at desc);
create index region_requests_open_idx on public.region_requests (created_at)
  where status = 'pending';

-- Одна открытая заявка на игрока: очередь из десяти одинаковых просьб никому
-- не помогает, а администратору мешает.
create unique index region_requests_one_open on public.region_requests (user_id)
  where status = 'pending';

alter table public.region_requests enable row level security;

-- Игрок видит свои заявки, администратор — все.
create policy "own region requests" on public.region_requests
  for select using (
    (select auth.uid()) = user_id
    or exists (select 1 from public.profiles p
                where p.id = (select auth.uid()) and p.is_admin)
  );
-- Пишут только функции ниже: там проверяется и причина, и права.

-- ── Валюта региона ────────────────────────────────────────────────────────
-- Одно место, где живёт правило «Россия — рубли, остальные — доллары».
create function public.currency_for_country(p_country text)
returns text
language sql
immutable
as $$ select case when upper(coalesce(p_country, '')) = 'RU' then 'RUB' else 'USD' end $$;

-- ── Подать заявку ─────────────────────────────────────────────────────────
create function public.region_request(p_country text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := (select auth.uid());
  prof    public.profiles%rowtype;
  target  text := upper(btrim(coalesce(p_country, '')));
  new_id  uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if target !~ '^[A-Z]{2}$' then raise exception 'bad_country'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 30 then raise exception 'reason_too_short'; end if;

  select * into prof from public.profiles where id = me;
  if prof is null then raise exception 'not_authenticated'; end if;
  if upper(coalesce(prof.country, '')) = target then raise exception 'same_region'; end if;

  if exists (select 1 from public.region_requests
              where user_id = me and status = 'pending') then
    raise exception 'request_pending';
  end if;

  insert into public.region_requests (
    user_id, from_country, from_currency, to_country, to_currency, reason)
  values (
    me, prof.country, prof.currency, target,
    public.currency_for_country(target), btrim(p_reason))
  returning id into new_id;

  return new_id;
end;
$$;

-- Отозвать свою заявку, пока она не рассмотрена.
create function public.region_request_cancel()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not_authenticated'; end if;
  delete from public.region_requests where user_id = me and status = 'pending';
end;
$$;

-- Последняя заявка игрока — её показывает личный кабинет.
create view public.my_region_request
with (security_invoker = true) as
  select id, to_country, to_currency, reason, status, admin_comment,
         created_at, decided_at
    from public.region_requests
   where user_id = (select auth.uid())
   order by created_at desc
   limit 1;

-- ── Очередь администратора ────────────────────────────────────────────────
-- Ник и почта join'ятся здесь, чтобы админка не делала второй запрос на
-- каждую строку. Почта нужна: решение уходит игроку письмом.
create function public.region_requests_open()
returns table (
  id uuid, nickname text, email text,
  from_country text, to_country text, to_currency text,
  reason text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, p.nickname, u.email::text,
         r.from_country, r.to_country, r.to_currency,
         r.reason, r.created_at
    from public.region_requests r
    join public.profiles p on p.id = r.user_id
    join auth.users u on u.id = r.user_id
   where r.status = 'pending'
     and exists (select 1 from public.profiles a
                  where a.id = (select auth.uid()) and a.is_admin)
   order by r.created_at;
$$;

-- ── Решение ───────────────────────────────────────────────────────────────
-- Возвращает всё, что нужно письму: кому писать, как зовут, что решили.
-- Регион меняется здесь же — одной транзакцией с отметкой о решении, иначе
-- бывает «письмо ушло, а страна прежняя».
create function public.region_decide(
  p_id uuid, p_approve boolean, p_comment text default null)
returns table (email text, nickname text, to_country text, to_currency text,
               approved boolean, comment text, locale text)
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := (select auth.uid());
  req public.region_requests%rowtype;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = me and is_admin) then
    raise exception 'forbidden';
  end if;

  select * into req from public.region_requests where id = p_id for update;
  if req is null then raise exception 'request_not_found'; end if;
  if req.status <> 'pending' then raise exception 'already_decided'; end if;

  update public.region_requests
     set status = case when p_approve then 'approved' else 'rejected' end::public.region_request_status,
         admin_comment = nullif(btrim(coalesce(p_comment, '')), ''),
         decided_at = now(),
         decided_by = me
   where id = p_id;

  if p_approve then
    update public.profiles
       set country = req.to_country, currency = req.to_currency
     where id = req.user_id;
  end if;

  return query
    select u.email::text, p.nickname, req.to_country, req.to_currency,
           p_approve, nullif(btrim(coalesce(p_comment, '')), ''), p.locale
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = req.user_id;
end;
$$;

revoke execute on function public.region_request(text, text)          from public, anon;
revoke execute on function public.region_request_cancel()             from public, anon;
revoke execute on function public.region_requests_open()              from public, anon;
revoke execute on function public.region_decide(uuid, boolean, text)  from public, anon;

grant execute on function public.region_request(text, text)           to authenticated;
grant execute on function public.region_request_cancel()              to authenticated;
grant execute on function public.region_requests_open()               to authenticated;
grant execute on function public.region_decide(uuid, boolean, text)   to authenticated;
