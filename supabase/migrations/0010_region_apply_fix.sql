-- ============================================================================
--  Одобренная заявка не меняла регион
--
--  profiles_guard возвращает на место поля, которые игрок менять не должен:
--  права, дату регистрации, страну и валюту. Триггер срабатывает на ЛЮБОЙ
--  update — в том числе на тот, что делает region_decide после одобрения
--  заявки. Функция честно писала новую страну, а триггер тут же возвращал
--  старую: в базе всё «получалось», а регион у игрока не менялся.
--
--  Чинится не отменой защиты, а разрешением на время конкретной операции:
--  наши функции поднимают флажок app.profile_admin_write, и только при нём
--  триггер пропускает служебные поля. Обычный update своего профиля — хоть
--  игроком, хоть админом — по-прежнему их не трогает.
-- ============================================================================

create or replace function public.profiles_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  privileged boolean := coalesce(
    current_setting('app.profile_admin_write', true) = 'on', false);
begin
  -- Серверные роли (вебхуки, миграции) не ограничиваем.
  if coalesce(auth.role(), 'service_role') in ('service_role', 'supabase_admin') then
    return new;
  end if;

  new.id         := old.id;
  new.is_admin   := old.is_admin;
  new.created_at := old.created_at;

  -- Регион привязан к аккаунту: от него зависит цена. Менять его можно только
  -- решением по заявке (region_decide), которое и поднимает флажок.
  if not privileged then
    new.country  := old.country;
    new.currency := old.currency;

    new.banned_at    := old.banned_at;
    new.banned_until := old.banned_until;
    new.ban_reason   := old.ban_reason;
    new.banned_by    := old.banned_by;
  end if;

  if new.nickname is distinct from old.nickname then
    new.nickname_changed_at := now();
  end if;

  return new;
end;
$$;

-- ── Решение по заявке ───────────────────────────────────────────────────────
--  Флажок ставится локально (третий аргумент set_config = true), поэтому живёт
--  только до конца транзакции и на соседние запросы не влияет.

create or replace function public.region_decide(
  p_id      uuid,
  p_approve boolean,
  p_comment text default null)
returns table(email text, nickname text, to_country text, to_currency text,
              approved boolean, comment text, locale text)
language plpgsql security definer set search_path = public as $$
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
    perform set_config('app.profile_admin_write', 'on', true);
    update public.profiles
       set country = req.to_country, currency = req.to_currency
     where id = req.user_id;
    perform set_config('app.profile_admin_write', 'off', true);
  end if;

  return query
    select u.email::text, p.nickname, req.to_country, req.to_currency,
           p_approve, nullif(btrim(coalesce(p_comment, '')), ''), p.locale
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = req.user_id;
end;
$$;

-- ── Блокировки ──────────────────────────────────────────────────────────────
--  Тот же флажок: раньше поля блокировки пропускались «если это админ», а
--  теперь — только если их пишет admin_ban / admin_unban.

create or replace function public.admin_ban(
  p_nickname text,
  p_until    timestamptz,
  p_reason   text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select id into v_id from public.profiles
   where lower(nickname) = lower(btrim(coalesce(p_nickname, '')));
  if v_id is null then raise exception 'player_not_found'; end if;

  if exists (select 1 from public.profiles where id = v_id and is_admin) then
    raise exception 'cannot_ban_admin';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'ban_reason_required';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'ban_until_past';
  end if;

  perform set_config('app.profile_admin_write', 'on', true);
  update public.profiles
     set banned_at    = now(),
         banned_until = p_until,
         ban_reason   = btrim(p_reason),
         banned_by    = (select auth.uid())
   where id = v_id;
  perform set_config('app.profile_admin_write', 'off', true);

  return jsonb_build_object('id', v_id, 'until', p_until);
end;
$$;

create or replace function public.admin_unban(p_nickname text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select id into v_id from public.profiles
   where lower(nickname) = lower(btrim(coalesce(p_nickname, '')));
  if v_id is null then raise exception 'player_not_found'; end if;

  perform set_config('app.profile_admin_write', 'on', true);
  update public.profiles
     set banned_at = null, banned_until = null, ban_reason = null, banned_by = null
   where id = v_id;
  perform set_config('app.profile_admin_write', 'off', true);
end;
$$;
